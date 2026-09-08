# Limites e orçamentos iniciais

Valores padrão da revisão inicial. Persistem na campanha e no runtime. Todos os agentes consultam o mesmo orçamento.

| Limite | Padrão | Escopo |
|---|---|---|
| Candidaturas confirmadas por run | 30 | `MAX_APPLICATIONS_PER_RUN` |
| Falhas consecutivas | 3 | `MAX_CONSECUTIVE_FAILURES` |
| Tentativas por tarefa | 2 | orquestrador (`maxRetries`) |
| Duração máxima do run | 4 horas | `MAX_RUN_DURATION_MS` |
| Consumo de tokens do run | 200000 | `MAX_RUN_TOKENS` |
| Consultas de acompanhamento sobrepostas | 1 | scheduler |
| Intervalo mínimo de acompanhamento | 30 minutos | agenda persistida |

Exceder um limite pausa a campanha com motivo explícito. Criar outro agente ou run não zera os contadores da campanha. Cancelamento impede novas ações externas.
