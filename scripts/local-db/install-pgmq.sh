#!/usr/bin/env bash
# Instala a extensão pgmq no PostgreSQL local (ADR-002).
#
# O pgmq é extensão de SQL PURO: não há código C nem Rust, e o Makefile apenas copia
# os arquivos para o diretório de extensões. Por isso `make install` não exige
# compilador e roda em qualquer máquina com `pg_config` no PATH — inclusive no runner
# da esteira, que traz o PostgreSQL pré-instalado.
#
# Instalar como EXTENSÃO, e não pelo caminho "SQL-only" que o projeto também oferece,
# é deliberado: o Supabase expõe o pgmq como extensão, e a migração faz
# `create extension pgmq`. Usar o caminho SQL-only aqui faria a migração divergir
# entre o ambiente de teste e o de produção — exatamente o tipo de diferença que só
# aparece quando já é tarde.
set -euo pipefail

# Mesma versão da imagem usada pela esteira (ghcr.io/pgmq/pg16-pgmq). Deixar as duas
# pontas divergirem já custou caro neste repositório: a diferença só aparece quando o
# comportamento muda, e aí parece defeito do código.
VERSAO="${PGMQ_VERSION:-v1.13.0}"
ORIGEM="${PGMQ_SOURCE_DIR:-${TMPDIR:-/tmp}/pgmq-${VERSAO}}"

if psql -h "${PGHOST:-127.0.0.1}" -U "${PGSUPERUSER:-postgres}" -d postgres -tAc \
     "select 1 from pg_available_extensions where name = 'pgmq'" 2>/dev/null | grep -q 1; then
  echo "✓ pgmq já disponível no cluster"
  exit 0
fi

echo "→ obtendo pgmq ${VERSAO}"
if [ ! -d "${ORIGEM}/.git" ]; then
  rm -rf "${ORIGEM}"
  git clone --depth 1 --branch "${VERSAO}" https://github.com/pgmq/pgmq.git "${ORIGEM}"
fi

echo "→ instalando a extensão"
# `make` antes de `make install`, e não apenas o segundo: o alvo padrão é que gera
# `sql/pgmq--<versão>.sql` a partir de `sql/pgmq.sql`, e o PGXS resolve a lista de
# arquivos a instalar na leitura do Makefile — antes de qualquer alvo rodar. Só com
# `install`, a extensão é copiada sem o script da versão corrente, e o `CREATE
# EXTENSION` falha com "no installation script nor update path".
make -C "${ORIGEM}/pgmq-extension" >/dev/null
make -C "${ORIGEM}/pgmq-extension" install >/dev/null

# Confirma pelo catálogo em vez de confiar no código de saída do make: o alvo de
# instalação pode copiar arquivos para um diretório que este cluster não lê.
psql -h "${PGHOST:-127.0.0.1}" -U "${PGSUPERUSER:-postgres}" -d postgres -tAc \
  "select 1 from pg_available_extensions where name = 'pgmq'" | grep -q 1 \
  || { echo "pgmq não apareceu em pg_available_extensions após a instalação"; exit 1; }

echo "✓ pgmq ${VERSAO} disponível"
