# Playbook: Aprendizagem Contínua sobre Falhas

Base de conhecimento operacional sobre falhas em testes ou incidentes de produção/CI. Cada entrada descreve causa-raiz, mitigação definitiva e a regra nova introduzida para evitar reincidência — em código (lint/teste) sempre que possível, não apenas em texto.

Toda entrada nova é adicionada ao **topo** da lista (mais recente primeiro). Nenhuma entrada é removida; se uma regra for revogada, adiciona-se uma entrada explicando por quê.

## Formato de entrada

```md
### AAAA-MM-DD — Título curto do incidente/falha

- **Sintoma**: o que foi observado (teste vermelho, erro em produção, alerta).
- **Causa-raiz**: por que aconteceu, não só o que aconteceu.
- **Mitigação aplicada**: o que foi corrigido no código/infra.
- **Regra nova**: o que muda para evitar reincidência (lint rule, teste novo, checklist de PR, ADR).
- **Referência**: PR/issue/commit relacionado.
```

---

*(Nenhuma entrada registrada ainda — este playbook é inicializado vazio junto com o scaffold do projeto em 2026-09-22. A primeira entrada real deve ser adicionada assim que o primeiro teste falhar em CI ou o primeiro incidente de produção ocorrer após o lançamento da Fase 0.)*
