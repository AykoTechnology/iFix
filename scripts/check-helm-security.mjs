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
 * Verifica, em todo workload (`Deployment`, `StatefulSet`, `DaemonSet`) renderizado:
 *
 *   - Regra de Ouro 1 / PSS Restricted, no pod: `runAsNonRoot`, uid/gid 65532 (o
 *     `nonroot` da própria imagem Distroless), `seccompProfile: RuntimeDefault`, sem
 *     `hostNetwork`/`hostPID`/`hostIPC`, sem volume `hostPath`.
 *   - Em TODO contêiner, inclusive `initContainers`: `allowPrivilegeEscalation: false`,
 *     `readOnlyRootFilesystem: true`, `capabilities.drop: [ALL]` sem `add`, sem
 *     `privileged`, e sem sobrescrever no contêiner o uid, o `runAsNonRoot` ou o
 *     seccomp do pod — o securityContext do contêiner vence o do pod.
 *   - Regra de Ouro 8: `terminationGracePeriodSeconds: 30` e o orçamento de
 *     encerramento fechando com folga — preStop + SHUTDOWN_TIMEOUT_MS + margem ≤ 30s,
 *     porque o prazo do pod começa ANTES do preStop. `preStop.sleep` é exigido só em
 *     workload servido por Service (tráfego empurrado); worker que puxa de fila não
 *     tem endpoint para esperar sair.
 *   - As três probes (startup/liveness/readiness) com `httpGet.path`.
 *
 * Reprova também o que não consegue olhar: Job/CronJob/Pod soltos e chart que
 * renderiza zero workloads. O que este script NÃO é: o controlador de admissão real da
 * PSS. É uma lista mantida à mão; a admissão real é verificada por
 * `scripts/check-helm-psa.mjs`. Os dois se complementam: a PSS não conhece a Regra de
 * Ouro 8 nem o uid 65532 da imagem, e esta lista não conhece tudo o que a PSS reprova.
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
 * Folga mínima entre o fim do prazo da aplicação e o SIGKILL. Sem ela, o guard de
 * encerramento da aplicação dispara no mesmo instante do SIGKILL e a saída ordenada
 * vira sorteio.
 */
export const MARGEM_DE_ENCERRAMENTO_MS = 2_000;

/** Tipos com `spec.template.spec`. Qualquer outro tipo de carga precisa ser adicionado aqui. */
export const WORKLOADS = new Set(["Deployment", "StatefulSet", "DaemonSet"]);

/**
 * Tipos que carregam pod mas cujo template está em outro caminho. Existem para que um
 * Job ou CronJob adicionado a um chart REPROVE por falta de suporte, em vez de passar
 * sem ser olhado — gate que não enxerga um recurso não pode aprová-lo em silêncio.
 */
const WORKLOADS_NAO_SUPORTADOS = new Set(["Job", "CronJob", "Pod", "ReplicaSet"]);

/** O workload recebe tráfego empurrado por algum Service do mesmo render? */
function servidoPorService(labelsDoPod, services) {
  return services.some((service) => {
    const seletor = service?.spec?.selector ?? {};
    const pares = Object.entries(seletor);
    return pares.length > 0 && pares.every(([chave, valor]) => labelsDoPod[chave] === valor);
  });
}

/**
 * Analisa uma lista de manifestos já decodificados (não texto YAML) e devolve as
 * violações encontradas.
 *
 * Função pura e exportada de propósito, no mesmo espírito de `analisar` em
 * `scripts/check-design-literals.mjs`: as fixtures de `tests/helm-security.test.ts`
 * prendem cada regra sem precisar do binário `helm` instalado, e a mesma função é o
 * que a esteira roda contra a saída real de `helm template`.
 *
 * Os manifestos de UM chart devem vir juntos: é pelos Services do mesmo render que se
 * decide se um workload recebe tráfego empurrado (e portanto precisa de preStop).
 */
export function analisar(manifestos) {
  const violacoes = [];
  const services = manifestos.filter((m) => m?.kind === "Service");

  for (const manifesto of manifestos) {
    if (!manifesto) continue;
    const nome = manifesto?.metadata?.name ?? "<sem nome>";

    if (WORKLOADS_NAO_SUPORTADOS.has(manifesto.kind)) {
      violacoes.push({
        deployment: nome,
        regra: "workload-nao-suportado",
        mensagem: `${manifesto.kind} não é coberto por este verificador — estenda-o antes de adicionar este tipo a um chart`,
      });
      continue;
    }
    if (!WORKLOADS.has(manifesto.kind)) continue;

    const template = manifesto?.spec?.template ?? {};
    const spec = template.spec ?? {};
    const pod = spec.securityContext ?? {};

    const registrar = (regra, mensagem, contêiner) =>
      violacoes.push({ deployment: nome, contêiner, regra, mensagem });

    // --- Pod: PodSecurityStandards Restricted + Regra de Ouro 1
    if (pod.runAsNonRoot !== true) {
      registrar("pod-sem-runasnonroot", "pod securityContext.runAsNonRoot não é true");
    }
    if (pod.runAsUser !== UID_NONROOT_DISTROLESS || pod.runAsGroup !== UID_NONROOT_DISTROLESS) {
      registrar(
        "uid-diferente-de-nonroot",
        `pod securityContext.runAsUser/runAsGroup não é ${UID_NONROOT_DISTROLESS} (uid nonroot da imagem Distroless)`,
      );
    }
    if (pod.seccompProfile?.type !== "RuntimeDefault") {
      registrar("seccomp-ausente", "pod securityContext.seccompProfile.type não é RuntimeDefault");
    }
    for (const campo of ["hostNetwork", "hostPID", "hostIPC"]) {
      if (spec[campo] === true) {
        registrar("namespace-do-host", `pod com ${campo}: true`);
      }
    }
    for (const volume of spec.volumes ?? []) {
      if (volume?.hostPath) {
        registrar("volume-hostpath", `volume "${volume.name}" monta hostPath do nó`);
      }
    }

    // --- Pod: Regra de Ouro 8
    const grace = spec.terminationGracePeriodSeconds;
    if (grace !== GRACE_PERIOD_ESPERADO) {
      registrar(
        "grace-period-incorreto",
        `terminationGracePeriodSeconds não é ${GRACE_PERIOD_ESPERADO} (Regra de Ouro 8)`,
      );
    }

    const contêineres = spec.containers ?? [];
    if (contêineres.length === 0) {
      registrar("sem-conteiner", "workload sem nenhum contêiner em spec.template.spec.containers");
    }

    // --- Todo contêiner, inclusive os de inicialização: um initContainer como root
    // tem o mesmo acesso ao nó que o contêiner principal.
    for (const contêiner of [...(spec.initContainers ?? []), ...contêineres]) {
      const nomeContêiner = contêiner?.name ?? "<sem nome>";
      const sc = contêiner?.securityContext ?? {};

      if (sc.allowPrivilegeEscalation !== false) {
        registrar(
          "escalonamento-de-privilegio-permitido",
          "securityContext.allowPrivilegeEscalation do contêiner não é false",
          nomeContêiner,
        );
      }
      if (sc.readOnlyRootFilesystem !== true) {
        registrar(
          "sistema-de-arquivos-gravavel",
          "securityContext.readOnlyRootFilesystem do contêiner não é true",
          nomeContêiner,
        );
      }
      if (!sc.capabilities?.drop?.includes("ALL")) {
        registrar(
          "capabilities-nao-dropadas",
          "securityContext.capabilities.drop do contêiner não inclui ALL",
          nomeContêiner,
        );
      }
      if ((sc.capabilities?.add ?? []).length > 0) {
        registrar(
          "capabilities-adicionadas",
          `securityContext.capabilities.add não é vazio: ${sc.capabilities.add.join(", ")}`,
          nomeContêiner,
        );
      }
      if (sc.privileged === true) {
        registrar("conteiner-privilegiado", "securityContext.privileged é true", nomeContêiner);
      }

      // O securityContext do contêiner SOBRESCREVE o do pod. Checar só o pod deixaria
      // passar um contêiner que declara `runAsUser: 0` por conta própria.
      if (sc.runAsNonRoot === false) {
        registrar(
          "conteiner-sobrescreve-nonroot",
          "contêiner declara runAsNonRoot: false",
          nomeContêiner,
        );
      }
      for (const campo of ["runAsUser", "runAsGroup"]) {
        if (sc[campo] !== undefined && sc[campo] !== UID_NONROOT_DISTROLESS) {
          registrar(
            "conteiner-sobrescreve-uid",
            `contêiner sobrescreve ${campo} com ${sc[campo]} (esperado ${UID_NONROOT_DISTROLESS} ou ausente)`,
            nomeContêiner,
          );
        }
      }
      if (sc.seccompProfile !== undefined && sc.seccompProfile?.type !== "RuntimeDefault") {
        registrar(
          "conteiner-sobrescreve-seccomp",
          `contêiner sobrescreve seccompProfile com ${sc.seccompProfile?.type}`,
          nomeContêiner,
        );
      }
    }

    // --- Contêineres principais: probes, preStop e orçamento de encerramento
    const empurrado = servidoPorService(template.metadata?.labels ?? {}, services);

    for (const contêiner of contêineres) {
      const nomeContêiner = contêiner?.name ?? "<sem nome>";

      for (const probe of ["startupProbe", "livenessProbe", "readinessProbe"]) {
        if (!contêiner?.[probe]?.httpGet?.path) {
          registrar("probe-ausente", `contêiner sem ${probe}.httpGet.path`, nomeContêiner);
        }
      }

      const preStop = contêiner?.lifecycle?.preStop;
      const segundosPreStop = preStop?.sleep?.seconds;
      if (preStop !== undefined && (typeof segundosPreStop !== "number" || segundosPreStop <= 0)) {
        registrar(
          "prestop-invalido",
          "lifecycle.preStop presente sem sleep.seconds positivo — a imagem Distroless não tem shell para um preStop exec (ADR-001)",
          nomeContêiner,
        );
      }
      if (empurrado && preStop === undefined) {
        registrar(
          "sem-prestop-sleep",
          "workload servido por Service sem lifecycle.preStop.sleep — o SIGTERM chegaria antes de o endpoint sair do balanceador",
          nomeContêiner,
        );
      }

      // O prazo do pod começa ANTES do preStop (documentação do Kubernetes, "Container
      // Lifecycle Hooks"). O que sobra para a aplicação é grace − preStop.
      const variavel = (contêiner?.env ?? []).find((e) => e?.name === "SHUTDOWN_TIMEOUT_MS");
      const timeoutMs = Number(variavel?.value);
      if (!variavel || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        registrar(
          "shutdown-timeout-ausente",
          "contêiner sem env SHUTDOWN_TIMEOUT_MS numérico — sem ele o orçamento de encerramento não é verificável",
          nomeContêiner,
        );
      } else if (typeof grace === "number") {
        const preStopMs = typeof segundosPreStop === "number" ? segundosPreStop * 1000 : 0;
        const total = preStopMs + timeoutMs + MARGEM_DE_ENCERRAMENTO_MS;
        if (total > grace * 1000) {
          registrar(
            "orcamento-de-encerramento-estourado",
            `preStop ${preStopMs}ms + SHUTDOWN_TIMEOUT_MS ${timeoutMs}ms + margem ${MARGEM_DE_ENCERRAMENTO_MS}ms = ${total}ms > terminationGracePeriodSeconds ${grace * 1000}ms`,
            nomeContêiner,
          );
        }
      }
    }
  }

  return violacoes;
}

/** Quantos workloads verificáveis há no render — zero é sempre erro de gate, nunca sucesso. */
export function contarWorkloads(manifestos) {
  return manifestos.filter((m) => WORKLOADS.has(m?.kind)).length;
}

/** Renderiza um chart com `helm template` e devolve os documentos decodificados. */
export function renderizar(caminhoDoChart) {
  const saida = execFileSync("helm", ["template", caminhoDoChart, "--kube-version", "1.30.0"], {
    cwd: RAIZ,
    encoding: "utf8",
  });
  // `loadAll` descarta documentos vazios (os `---` que sobram de blocos `{{- if }}`
  // que não renderizaram nada) sozinho, mas devolve `undefined` para eles — filtrar
  // explicitamente evita que `analisar` precise saber disso.
  return [...loadAll(saida)].filter(Boolean);
}

/** Charts verificados pelo gate 11. `charts/infra` fica de fora enquanto for só README. */
export const CHARTS = ["charts/api", "charts/workers"];

async function principal() {
  const charts = CHARTS;
  const violacoes = [];
  let total = 0;

  for (const chart of charts) {
    const manifestos = renderizar(chart);
    const quantidade = contarWorkloads(manifestos);
    // Um chart que renderiza zero workloads não foi verificado — foi pulado. Aprovar
    // isso é o "gate que aprova por vacuidade" do playbook (entrada de 2026-09-22).
    if (quantidade === 0) {
      violacoes.push({
        deployment: chart,
        regra: "nenhum-workload",
        mensagem: "o render não produziu nenhum workload verificável",
      });
    }
    total += quantidade;
    violacoes.push(...analisar(manifestos));
  }

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

  console.log(
    `✓ gate 11 (segurança estrutural): ${total} workload(s) verificado(s) em ${charts.length} chart(s)`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await principal();
}
