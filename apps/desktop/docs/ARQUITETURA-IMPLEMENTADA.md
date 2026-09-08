# Arquitetura implementada — 1.1.0

## Módulos e fronteiras

- `desktop/`: janela, IPC limitado, diagnóstico, preparação da pasta de dados e supervisão do processo local.
- `app/public/`: interface web compartilhada. `persistence.js` encapsula migração e recuperação.
- `app/src/runtime.mjs`: composição dos serviços e integrações.
- `app/src/domain/`: transições de fila, candidatura, execução e aprovação.
- `app/src/process-manager.mjs` e `application-flow.mjs`: coordenação persistida por candidatura; etapas `prepared`, `submitting`, `confirmed`, `needs_reconcile`, `recorded`.
- `policy.mjs` e `approval-service.mjs`: aprovação humana vinculada ao hash da revisão.
- `domain-tools.mjs`: ferramentas limitadas do agente, validação de entradas e vinculação à execução.
- `agent-adapter.mjs` / `stdio-agent-transport.mjs`: protocolo JSONL bidirecional, correlação thread/turn/run, erros e prazo de resposta.
- `playwright-driver.mjs`, `browser-adapter.mjs`, `platform-adapters.mjs`: navegação, observação e extração com interrupção quando a página não é reconhecida.
- `persistence-authority.mjs`: autoridade operacional progressiva SQLite; `legacy-bridge.mjs`: compatibilidade isolada dos scripts.
- `e2e/`: testes reais controlados, sem contas externas.

É um monólito modular com adaptadores, sem dependência do Electron nos serviços de negócio. O código continua JavaScript ESM. Não foi feito um redesenho integral da UI nem uma migração para TypeScript.

## Persistência

SQLite operacional usa documentos JSON transacionais por agregado (`campaign`, `queue`, `applications`), preservando campos legados desconhecidos. Trata-se da primeira etapa da migração, não de uma normalização relacional completa. A projeção/indexação e as execuções continuam no banco harness. O estado da aplicação é obtido da autoridade selecionada; snapshots de browser nunca substituem silenciosamente dados locais.

A recuperação distingue falha antes do clique, resultado ambíguo e confirmação observada. Só esta última permite repetir exclusivamente o registro local. Contagem por execução usa chave idempotente. Locks de processos encerrados podem ser recuperados; locks de processos vivos permanecem bloqueados.

## Proveniência

Base P0 `4aeb62a`, snapshot do harness `f10942c`, merge `54cc734`. As árvores originais permaneceram intactas. Ver `CONSOLIDACAO.md` e `DESKTOP.md` para operação e limites verificados.
