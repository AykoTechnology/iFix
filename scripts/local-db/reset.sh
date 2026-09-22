#!/usr/bin/env bash
# Recria o banco de testes do zero e aplica todas as migrações em ordem.
#
# ADR-018 exige banco efêmero por execução. O alvo original é Testcontainers; onde
# Docker não estiver disponível (como em containers de desenvolvimento sem daemon),
# este script entrega a mesma garantia recriando o banco a cada execução.
set -euo pipefail

DB="${PGDATABASE:-ifix_test}"
PSQL_SUPER="${PSQL_SUPER:-su postgres -c}"

run_super() { $PSQL_SUPER "psql -v ON_ERROR_STOP=1 -q $*"; }

echo "→ recriando banco ${DB}"
run_super "-c 'drop database if exists ${DB}'"
run_super "-c 'create database ${DB}'"

echo "→ bootstrap de papéis e extensões"
run_super "-d ${DB} -f $(pwd)/scripts/local-db/bootstrap.sql"

echo "→ aplicando migrações"
for migration in supabase/migrations/*.sql; do
  echo "   $(basename "$migration")"
  run_super "-d ${DB} -f $(pwd)/${migration}"
done

echo "→ concedendo acesso aos papéis de teste"
run_super "-d ${DB} -c 'grant connect on database ${DB} to authenticated, service_role'"

echo "✓ ${DB} pronto"
