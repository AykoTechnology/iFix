# Empacotamento multi-estágio para Google Distroless (ADR-001, especificação § 6.2).
#
# A imagem final não contém shell, gerenciador de pacotes, nem os binários de SO que
# compõem a maior parte da superfície de CVE de uma imagem convencional. A contrapartida
# é operacional e precisa ser conhecida: **não há como `kubectl exec` num pod destes**.
# Diagnóstico em produção é feito por contêiner efêmero de depuração e, sobretudo, pelo
# trace e pelo log estruturado — daí a instrumentação não ser opcional (ADR-008).

# ---------------------------------------------------------------------------
# Estágio 1 — compilação
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Manifests antes do código: enquanto as dependências não mudarem, o Docker reaproveita
# a camada de instalação e o build fica na casa dos segundos.
COPY package.json package-lock.json ./
COPY src/shared/package.json ./src/shared/
COPY src/api/package.json ./src/api/
RUN npm ci

COPY tsconfig.base.json tsconfig.json ./
COPY src/ ./src/

# `tsc --build` compila os projetos referenciados e falha em qualquer erro de tipo:
# a verificação estática é parte do empacotamento, não uma etapa separada que se possa
# esquecer de rodar.
RUN npx tsc --build

# ---------------------------------------------------------------------------
# Estágio 2 — dependências de produção
# ---------------------------------------------------------------------------
# Estágio próprio para que `node_modules` chegue ao runtime já sem devDependencies.
# Podar após instalar deixaria resíduo; instalar do zero com --omit=dev não deixa.
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY src/shared/package.json ./src/shared/
COPY src/api/package.json ./src/api/
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------
# Estágio 3 — execução
# ---------------------------------------------------------------------------
# Base em Debian 13, não 12. A variante debian12 carrega `libssl3` 3.0.18, com 6
# vulnerabilidades corrigidas a montante (1 crítica, 5 altas) que o gate 9 bloqueia —
# e Distroless não tem gerenciador de pacotes, então não há como atualizar de dentro
# da imagem: a única correção possível é trocar a base. A variante debian13 usa o
# mesmo Node 22 LTS exigido pelo ADR-001 e varre limpa.
#
# A tag é flutuante de propósito: uma base fixada por digest congela a imagem na
# versão vulnerável, e a reconstrução periódica a montante é justamente o mecanismo
# que mantém as correções chegando.
FROM gcr.io/distroless/nodejs22-debian13 AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps  /app/node_modules ./node_modules

# O layout do workspace é preservado porque `node_modules/@ifix/shared` é um link
# relativo para `src/shared`. Copiar o `dist` e o manifest mantém o alvo do link válido
# sem arrastar o código-fonte TypeScript para dentro da imagem.
COPY --from=build /app/src/shared/package.json ./src/shared/
COPY --from=build /app/src/shared/dist         ./src/shared/dist
COPY --from=build /app/src/api/package.json    ./src/api/
COPY --from=build /app/src/api/dist            ./src/api/dist

# Sem privilégio e sem escrita: o `securityContext` do pod completa com
# readOnlyRootFilesystem e allowPrivilegeEscalation: false. A única escrita permitida
# é em /tmp, que chega como volume montado (Regra de Ouro 1).
USER nonroot:nonroot

EXPOSE 3000

# O ENTRYPOINT da imagem distroless já é o próprio node: o processo da aplicação é
# PID 1 e recebe SIGTERM diretamente, sem supervisor intermediário. É o que torna o
# graceful shutdown do `src/api/src/index.ts` efetivo (Regra de Ouro 8).
CMD ["src/api/dist/index.js"]
