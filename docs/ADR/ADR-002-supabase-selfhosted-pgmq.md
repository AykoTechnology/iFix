# ADR-002: Utilização do Supabase Self-Hosted e Supabase Queues (pgmq)

- **Status:** Aprovado
- **Data:** 2026-09-22

## Contexto

A plataforma precisa de banco relacional, autenticação, storage, mensageria assíncrona e realtime, sem multiplicar peças de infraestrutura a operar em Kubernetes.

## Decisão

Padronizar banco de dados (PostgreSQL 16+), autenticação (GoTrue), storage e filas assíncronas (`pgmq`) na infraestrutura unificada do Supabase Self-Hosted, substituindo brokers externos (RabbitMQ, SQS, Kafka) por filas transacionais no próprio Postgres.

## Consequências

- Reduz drasticamente a complexidade de manutenção de infraestrutura no Kubernetes (uma peça de estado a operar/fazer backup, não três).
- Garante consistência transacional ACID entre a mutação de um chamado e o enfileiramento de uma ação de automação decorrente — ambos no mesmo `COMMIT`.
- `pgmq` não é um message broker de propósito geral: throughput e latência de fan-out são inferiores a soluções dedicadas. Filas com volume muito alto (ex.: ingestão de eventos de monitoramento externo em escala) precisam de avaliação de capacidade antes de assumir que `pgmq` escala sem limites — registrar teste de carga como item do Épico 10 (Observabilidade/Hardening).
- Consumidores de fila **devem ser idempotentes** (ver Regras de Ouro em `docs/CONTEXT.md`) — `pgmq` garante *at-least-once*, não *exactly-once*.
- DLQ (Dead Letter Queue) é obrigatória para toda fila de produção, com alerta de observabilidade quando uma mensagem cai nela (ver ADR-008).
