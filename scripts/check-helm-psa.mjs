#!/usr/bin/env node
/**
 * Gate 11 (admissão real) — PodSecurityStandards Restricted verificada pelo próprio
 * Kubernetes, não por uma lista mantida à mão.
 *
 * `check-helm-security.mjs` confere os campos que alguém lembrou de listar. Este script
 * sobe um `kube-apiserver` 1.30 de verdade (sem nós nem Docker: a admissão da PSS roda
 * dentro do apiserver) e aplica os workloads renderizados com `--dry-run=server` num
 * namespace em `pod-security.kubernetes.io/enforce=restricted`. Quem decide é o
 * controlador de admissão oficial — o mesmo que o cluster de produção vai rodar.
 *
 * Detalhe que muda o desenho: a PSS só BLOQUEIA Pods. Para um Deployment ela emite um
 * AVISO ("would violate PodSecurity") e aceita o objeto. Por isso o namespace também tem
 * o rótulo `warn=restricted` e o `kubectl` roda com `--warnings-as-errors`.
 *
 * Controle negativo: a cada execução, um Deployment deliberadamente inseguro precisa
 * ser reprovado. Se passar, a PSS não está ativa e o gate não provaria nada — ele
 * reprova em vez de aprovar por vacuidade.
 *
 * Exige KUBEBUILDER_ASSETS apontando para um diretório com `etcd`, `kube-apiserver` e
 * `kubectl` (instalado por `setup-envtest`), além do `helm` no PATH.
 */

import { spawn, spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dump } from "js-yaml";
import { CHARTS, WORKLOADS, renderizar } from "./check-helm-security.mjs";

const NAMESPACE = "ifix-psa";
const TOKEN = "ifix-psa-token";

const ASSETS = process.env.KUBEBUILDER_ASSETS;
if (!ASSETS) {
  console.error("KUBEBUILDER_ASSETS não definido — rode `setup-envtest use 1.30.x -p path`.");
  process.exit(2);
}

/** Uma porta livre agora. Há corrida teórica até o processo abrir a porta; aceitável num job isolado. */
const portaLivre = () =>
  new Promise((resolve, reject) => {
    const servidor = createServer();
    servidor.once("error", reject);
    servidor.listen(0, "127.0.0.1", () => {
      const { port } = servidor.address();
      servidor.close(() => resolve(port));
    });
  });

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const INSEGURO = {
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: { name: "controle-negativo" },
  spec: {
    selector: { matchLabels: { app: "controle" } },
    template: {
      metadata: { labels: { app: "controle" } },
      spec: { containers: [{ name: "c", image: "busybox", securityContext: { runAsUser: 0 } }] },
    },
  },
};

async function principal() {
  const dir = mkdtempSync(join(tmpdir(), "ifix-psa-"));
  const processos = [];

  try {
    const [etcdCliente, etcdPeer, apiPorta] = [
      await portaLivre(),
      await portaLivre(),
      await portaLivre(),
    ];

    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    writeFileSync(join(dir, "sa.pub"), publicKey.export({ type: "spki", format: "pem" }));
    writeFileSync(join(dir, "sa.key"), privateKey.export({ type: "pkcs8", format: "pem" }));
    writeFileSync(join(dir, "tokens.csv"), `${TOKEN},admin,admin,system:masters\n`);

    const iniciar = (binario, args) => {
      const processo = spawn(join(ASSETS, binario), args, { stdio: ["ignore", "ignore", "pipe"] });
      let log = "";
      processo.stderr.on("data", (d) => (log = (log + d).slice(-4000)));
      processos.push({ binario, processo, log: () => log });
      return processo;
    };

    iniciar("etcd", [
      `--data-dir=${join(dir, "etcd")}`,
      `--listen-client-urls=http://127.0.0.1:${etcdCliente}`,
      `--advertise-client-urls=http://127.0.0.1:${etcdCliente}`,
      `--listen-peer-urls=http://127.0.0.1:${etcdPeer}`,
    ]);
    iniciar("kube-apiserver", [
      `--etcd-servers=http://127.0.0.1:${etcdCliente}`,
      `--cert-dir=${join(dir, "certs")}`,
      `--secure-port=${apiPorta}`,
      "--bind-address=127.0.0.1",
      `--token-auth-file=${join(dir, "tokens.csv")}`,
      "--authorization-mode=RBAC",
      "--service-account-issuer=https://ifix.psa.local",
      `--service-account-key-file=${join(dir, "sa.pub")}`,
      `--service-account-signing-key-file=${join(dir, "sa.key")}`,
      "--service-cluster-ip-range=10.0.0.0/24",
    ]);

    // Apiserver efêmero em loopback, certificado autoassinado gerado por ele mesmo:
    // não há o que verificar na cadeia de TLS, e o processo morre com o job.
    const kubectl = (args, entrada) =>
      spawnSync(
        join(ASSETS, "kubectl"),
        [
          `--server=https://127.0.0.1:${apiPorta}`,
          `--token=${TOKEN}`,
          "--insecure-skip-tls-verify",
          ...args,
        ],
        { input: entrada, encoding: "utf8" },
      );

    let pronto = false;
    for (let tentativa = 0; tentativa < 60 && !pronto; tentativa++) {
      pronto = kubectl(["get", "--raw", "/readyz"]).status === 0;
      if (!pronto) await dormir(1000);
    }
    if (!pronto) {
      for (const { binario, log } of processos) console.error(`--- ${binario} ---\n${log()}`);
      throw new Error("o kube-apiserver não ficou pronto em 60s");
    }

    const versao = kubectl(["version", "-o", "json"]);
    const servidor = JSON.parse(versao.stdout).serverVersion.gitVersion;

    kubectl(["create", "namespace", NAMESPACE]);
    const rotulo = kubectl([
      "label",
      "namespace",
      NAMESPACE,
      "pod-security.kubernetes.io/enforce=restricted",
      "pod-security.kubernetes.io/warn=restricted",
    ]);
    if (rotulo.status !== 0) throw new Error(`falha ao rotular o namespace: ${rotulo.stderr}`);

    const aplicar = (manifestos) =>
      kubectl(
        ["--warnings-as-errors", "apply", "--dry-run=server", "-n", NAMESPACE, "-f", "-"],
        manifestos.map((m) => dump(m)).join("---\n"),
      );

    const controle = aplicar([INSEGURO]);
    if (controle.status === 0 || !/would violate PodSecurity/.test(controle.stderr)) {
      throw new Error(
        "controle negativo APROVADO: um Deployment com runAsUser: 0 passou pela admissão. " +
          "A PSS não está ativa neste apiserver, e aprovar os charts aqui não provaria nada.",
      );
    }

    const falhas = [];
    let total = 0;
    for (const chart of CHARTS) {
      const workloads = renderizar(chart).filter((m) => WORKLOADS.has(m?.kind));
      if (workloads.length === 0) {
        falhas.push(`${chart}: o render não produziu nenhum workload`);
        continue;
      }
      total += workloads.length;
      const resultado = aplicar(workloads);
      if (resultado.status !== 0) falhas.push(`${chart}:\n${resultado.stderr.trim()}`);
    }

    if (falhas.length > 0) {
      console.error(`Gate 11 — admissão PodSecurity "restricted" (${servidor}) reprovou:\n`);
      for (const falha of falhas) console.error(`  ${falha.replaceAll("\n", "\n  ")}\n`);
      process.exitCode = 1;
      return;
    }

    console.log(
      `✓ gate 11 (admissão PSS restricted, kube-apiserver ${servidor}): ${total} workload(s) aceito(s) ` +
        "em " +
        `${CHARTS.length} chart(s); controle negativo reprovado como esperado`,
    );
  } finally {
    for (const { processo } of processos.reverse()) processo.kill("SIGTERM");
    await dormir(500);
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await principal().catch((erro) => {
    console.error(`Gate 11 (admissão PSS): ${erro.message}`);
    process.exitCode = 1;
  });
}
