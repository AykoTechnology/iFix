# charts/api

Helm chart do serviço `src/api`. Deve declarar `securityContext` (nonroot, readOnlyRootFilesystem, allowPrivilegeEscalation: false — ADR-001), as 3 probes (startup/liveness/readiness — spec técnica § 4.3), `terminationGracePeriodSeconds: 30` e HPA baseado em CPU/memória.
