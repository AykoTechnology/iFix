import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { Pool } from "pg";
import {
  checkLiveness,
  checkReadiness,
  checkStartup,
  probeResponseSchema,
  type ProbeResult,
} from "@ifix/shared";

/**
 * As três probes do worker, pelo mesmo motivo que a API as tem (ADR-001, ADR-008):
 * a imagem Distroless não tem shell, então não há como o Kubernetes fazer
 * `exec` para checar saúde — HTTP é a única superfície de diagnóstico possível.
 *
 * `node:http` puro, não Fastify: o worker não serve rota de negócio nenhuma (o
 * limite documentado em `docs/CONTEXT.md` § 2 — "servir HTTP síncrono ao usuário
 * final" não é responsabilidade dele), e três rotas triviais não justificam a
 * dependência de um framework inteiro num pacote que hoje só consome fila.
 *
 * O formato de resposta é o mesmo `probeResponseSchema` da API: as duas espécies de
 * serviço falam o mesmo contrato de saúde com o cluster.
 */

type Verificacao = () => ProbeResult | Promise<ProbeResult>;

function responder(res: ServerResponse, resultado: ProbeResult): void {
  const corpo = probeResponseSchema.parse({
    status: resultado.ok ? "ok" : "degraded",
    detail: resultado.detail,
  });
  res.writeHead(resultado.ok ? 200 : 503, { "content-type": "application/json" });
  res.end(JSON.stringify(corpo));
}

export function createProbeServer(
  pool: Pool,
  eventLoopThresholdMs: number,
  // Injetável para teste: as três verificações reais nunca lançam (cada uma trata o
  // próprio erro e devolve `{ ok: false, ... }`), então o `catch` abaixo é defesa
  // contra uma verificação futura que quebre esse contrato — e defesa não exercitada
  // é a mesma vacuidade que este repositório já pagou caro para aprender a evitar.
  rotas: Record<string, Verificacao> = {
    "/health/live": () => checkLiveness(eventLoopThresholdMs),
    "/health/ready": () => checkReadiness(pool),
    "/health/startup": () => checkStartup(pool),
  },
): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    // Método incorreto é 404, não 405: um GET indevido não deve revelar mais sobre a
    // rota do que "não existe" — a mesma resposta que uma rota inexistente daria.
    const verificar = req.method === "GET" ? rotas[req.url ?? ""] : undefined;

    if (!verificar) {
      res
        .writeHead(404, { "content-type": "application/json" })
        .end(JSON.stringify({ error: "not_found", message: "rota inexistente" }));
      return;
    }

    // `Promise.resolve().then(verificar)` — não `Promise.resolve(verificar())` — de
    // propósito: a segunda forma avalia `verificar()` antes de entrar na cadeia de
    // promises, então uma verificação que lança de forma SÍNCRONA escaparia do
    // `.catch` abaixo e derrubaria o processo, sem chegar a responder ao kubelet.
    Promise.resolve()
      .then(verificar)
      .then((resultado) => responder(res, resultado))
      .catch((error: unknown) => {
        // Espelha o tratamento da API: detalhe de driver não vaza ao chamador da
        // probe, mesmo que aqui o "chamador" seja o próprio kubelet. O log estruturado
        // em stderr é o que sustenta o diagnóstico — não há shell para inspecionar
        // depois (ADR-001), então uma falha silenciosa aqui seria invisível para sempre.
        process.stderr.write(
          `${JSON.stringify({
            level: "error",
            msg: "falha ao avaliar probe",
            rota: req.url,
            erro: error instanceof Error ? error.message : String(error),
          })}\n`,
        );
        res
          .writeHead(500, { "content-type": "application/json" })
          .end(JSON.stringify({ error: "internal_error", message: "erro interno" }));
      });
  });
}
