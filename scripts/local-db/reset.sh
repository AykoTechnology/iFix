#!/usr/bin/env bash
# Recria o banco de testes do zero e aplica todas as migrações em ordem.
#
# ADR-018 exige banco efêmero por execução. O alvo original é Testcontainers; onde
# Docker não estiver disponível — container de desenvolvimento sem daemon, ou um
# service container já provido pela esteira — este script entrega a mesma garantia
# recriando o banco a cada execução.
#
# Conecta por TCP usando as variáveis PG* padrão, de modo que o mesmo script sirva ao
# desenvolvimento local e ao CI sem ramificação.
set -euo pipefail

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGSUPERUSER:-postgres}"
export PGPASSWORD="${PGSUPERPASSWORD:-local_dev_only}"

DB="${PGDATABASE:-ifix_test}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

psql_super() { psql -v ON_ERROR_STOP=1 -q --no-psqlrc "$@"; }

echo "→ aguardando PostgreSQL em ${PGHOST}:${PGPORT}"
for _ in $(seq 1 30); do
  if psql_super -d postgres -c 'select 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
psql_super -d postgres -c 'select 1' >/dev/null

echo "→ recriando banco ${DB}"
# Encerra conexões remanescentes: uma sessão aberta de execução anterior faria o
# DROP falhar e o banco herdaria estado da rodada passada.
psql_super -d postgres -c \
  "select pg_terminate_backend(pid) from pg_stat_activity where datname = '${DB}' and pid <> pg_backend_pid()" >/dev/null
psql_super -d postgres -c "drop database if exists ${DB}"
psql_super -d postgres -c "create database ${DB}"

echo "→ garantindo a extensão pgmq"
PGHOST="${PGHOST}" PGSUPERUSER="${PGUSER}" "${ROOT}/scripts/local-db/install-pgmq.sh"

echo "→ bootstrap de papéis e extensões"
psql_super -d "${DB}" -f "${ROOT}/scripts/local-db/bootstrap.sql"

echo "→ aplicando migrações"
for migration in "${ROOT}"/supabase/migrations/*.sql; do
  echo "   $(basename "${migration}")"
  psql_super -d "${DB}" -f "${migration}"
done

echo "→ concedendo acesso aos papéis da aplicação"
psql_super -d "${DB}" -c "grant connect on database ${DB} to authenticated, service_role"

echo "✓ ${DB} pronto"
