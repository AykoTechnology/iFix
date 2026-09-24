#!/usr/bin/env node
/**
 * Gate 11 (parte estrutural) — especificação § 6.4, ADR-001, Regras de Ouro 1 e 8.
 *
 * `helm lint` e o `kubeconform` (rodados separadamente na esteira) provam que os
 * manifestos são Helm e Kubernetes válidos. Nenhum dos dois prova a invariante que
 * importa aqui: que o Deployment renderizado é de fato PodSecurityStandards
 * Restricted e de fato desliga de forma coordenada. Um chart pode ser perfeitamente
 * válido e ainda assim rodar como root — este script é o que reprova isso.
 *
 * Verifica, em todo `Deployment` renderizado pelos charts:
 *
 *   - Regra de Ouro 1 / PSS Restricted: `runAsNonRoot`, uid/gid 65532 (o `nonroot`
 *     da própria imagem Distroless — ver o Dockerfile), `seccompProfile:
 *     RuntimeDefault`, e por contêiner `allowPrivilegeEscalation: false`,
 *     `readOnlyRootFilesystem: true`, `capabilities.drop: [ALL]`.
 *   - Regra de Ouro 8: `terminationGracePeriodSeconds: 30` e um
 *     `lifecycle.preStop.sleep` por contêiner — sem os dois, o SIGTERM chega antes
 *     do balanceador (ou do KEDA) parar de rotear trabalho novo para o pod.
 *   - As três probes (startup/liveness/readiness) presentes e com `httpGet.path`
 *     em todo contêiner — um pod sem elas nunca é considerado pronto ou nunca é
 *     reiniciado quando trava, e o Kubernetes não tem como saber a diferença entre
 *     "inicializando" e "morto".
 *
 * O uid/gid 65532 está fixo aqui, não configurável: é uma invariante do produto, não
 * do ambiente — mesma razão por trás de `values.yaml` não expor `securityContext` em
 * nenhum dos dois charts.
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAll } from "js-yaml";

const RAIZ = resolve(fileURLToPath(import.meta.url), "../..");
const UID_NONROOT_DISTROLESS = 65532;
const GRACE_PERIOD_ESPERADO = 30;

/**
 * Analisa uma lista de manifestos já decodificados (não texto YAML) e devolve as
 * violações encontradas.
 *
 * Função pura e exportada de propósito, no mesmo espírito de `analisar` em
 * `scripts/check-design-literals.mjs`: as fixtures de `tests/helm-security.test.ts`
 * prendem cada regra sem precisar do binário `helm` instalado, e a mesma função é o
 * que a esteira roda contra a saída real de `helm template`.
 */
export function analisar(manifestos) {
  const violacoes = [];

  for (const manifesto of manifestos) {
    if (!manifesto || manifesto.kind !== "Deployment") continue;

    const nome = manifesto?.metadata?.name ?? "<sem nome>";
    const spec = manifesto?.spec?.template?.spec ?? {};
    const podSecurityContext = spec.securityContext ?? {};

    const registrar = (regra, mensagem, contêiner) =>
      violacoes.push({ deployment: nome, contêiner, regra, mensagem });

    if (podSecurityContext.runAsNonRoot !== true) {
      registrar("pod-sem-runasnonroot", "pod securityContext.runAsNonRoot não é true");
    }
    if (
      podSecurityContext.runAsUser !== UID_NONROOT_DISTROLESS ||
      podSecurityContext.runAsGroup !== UID_NONROOT_DISTROLESS
    ) {
      registrar(
        "uid-diferente-de-nonroot",
        `pod securityContext.runAsUser/runAsGroup não é ${UID_NONROOT_DISTROLESS} (uid nonroot da imagem Distroless)`,
      );
    }
    if (podSecurityContext.seccompProfile?.type !== "RuntimeDefault") {
      registrar("seccomp-ausente", "pod securityContext.seccompProfile.type não é RuntimeDefault");
    }
    if (spec.terminationGracePeriodSeconds !== GRACE_PERIOD_ESPERADO) {
      registrar(
        "grace-period-incorreto",
        `terminationGracePeriodSeconds não é ${GRACE_PERIOD_ESPERADO} (Regra de Ouro 8)`,
      );
    }

    const contêineres = spec.containers ?? [];
    if (contêineres.length === 0) {
      registrar(
        "sem-conteiner",
        "Deployment sem nenhum contêiner em spec.template.spec.containers",
      );
    }

    for (const contêiner of contêineres) {
      const nomeContêiner = contêiner?.name ?? "<sem nome>";
      const contêinerSecurityContext = contêiner?.securityContext ?? {};

      if (contêinerSecurityContext.allowPrivilegeEscalation !== false) {
        registrar(
          "escalonamento-de-privilegio-permitido",
          "securityContext.allowPrivilegeEscalation do contêiner não é false",
          nomeContêiner,
        );
      }
      if (contêinerSecurityContext.readOnlyRootFilesystem !== true) {
        registrar(
          "sistema-de-arquivos-gravavel",
          "securityContext.readOnlyRootFilesystem do contêiner não é true",
          nomeContêiner,
        );
      }
      if (!contêinerSecurityContext.capabilities?.drop?.includes("ALL")) {
        registrar(
          "capabilities-nao-dropadas",
          "securityContext.capabilities.drop do contêiner não inclui ALL",
          nomeContêiner,
        );
      }

      const seconds = contêiner?.lifecycle?.preStop?.sleep?.seconds;
      if (typeof seconds !== "number" || seconds <= 0) {
        registrar(
          "sem-prestop-sleep",
          "contêiner sem lifecycle.preStop.sleep.seconds positivo — a imagem Distroless não tem shell para um preStop exec (ADR-001)",
          nomeContêiner,
        );
      }

      for (const probe of ["startupProbe", "livenessProbe", "readinessProbe"]) {
        if (!contêiner?.[probe]?.httpGet?.path) {
          registrar("probe-ausente", `contêiner sem ${probe}.httpGet.path`, nomeContêiner);
        }
      }
    }
  }

  return violacoes;
}

/** Renderiza um chart com `helm template` e devolve os documentos decodificados. */
function renderizar(caminhoDoChart) {
  const saida = execFileSync("helm", ["template", caminhoDoChart, "--kube-version", "1.30.0"], {
    cwd: RAIZ,
    encoding: "utf8",
  });
  // `loadAll` descarta documentos vazios (os `---` que sobram de blocos `{{- if }}`
  // que não renderizaram nada) sozinho, mas devolve `undefined` para eles — filtrar
  // explicitamente evita que `analisar` precise saber disso.
  return [...loadAll(saida)].filter(Boolean);
}

async function principal() {
  const charts = ["charts/api", "charts/workers"];
  const manifestos = charts.flatMap((chart) => renderizar(chart));

  const violacoes = analisar(manifestos);

  if (violacoes.length > 0) {
    console.error(
      "Gate 11 — chart Helm fora da PodSecurityStandards Restricted ou da Regra de Ouro 8:\n",
    );
    for (const v of violacoes) {
      const alvo = v.contêiner ? `${v.deployment}/${v.contêiner}` : v.deployment;
      console.error(`  ${alvo}  [${v.regra}]  ${v.mensagem}`);
    }
    process.exit(1);
  }

  const deployments = manifestos.filter((m) => m?.kind === "Deployment").length;
  console.log(
    `✓ gate 11 (segurança estrutural): ${deployments} Deployment(s) verificado(s) em ${charts.length} chart(s)`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await principal();
}
