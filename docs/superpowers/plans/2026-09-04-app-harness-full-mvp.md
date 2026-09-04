# App Harness do Fluxo — Full MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir o dashboard somente leitura para um harness local do pacote `Fluxo/`, com estado operacional, fila, aprovações, runs, eventos, scripts seguros, checkpoint, exportação e integração controlada com navegador.

**Architecture:** O backend mantém uma projeção SQLite local e usa os JSONs do `Fluxo/` como fonte operacional até a migração formal. A API aplica máquina de estados, lock, idempotência e políticas; o agente e o navegador são adapters substituíveis, com fixtures simuladas nos testes.

**Tech Stack:** Node.js 24+, JavaScript ESM, `node:test`, `node:sqlite`, `node:http`, HTML/CSS/JavaScript, PowerShell 7+ e Playwright CLI local.

**Spec:** `docs/PRD-APP-HARNESS.md` e `docs/SDD-APP-HARNESS.md`

## Global Constraints

- Escopo exclusivo do `Fluxo/`.
- TDD obrigatório: teste falhando observado antes de cada comportamento de produção.
- Nenhum teste envia candidatura real, acessa conta real ou executa Playwright contra plataforma real.
- `.env`, currículo, perfil, fila, campanha, checkpoint, evidências e mensagens reais não entram em respostas públicas, logs ou exportação.
- `REQUIRE_FINAL_CONFIRMATION=true` permanece padrão.
- JSONs existentes continuam fonte operacional até reconciliação e migração formal.
- Apenas `127.0.0.1` no MVP.

---

### Task 1: Estado, API e dashboard

Já implementada nos commits anteriores: leitor seguro, `GET /health`, `GET /api/v1/state`, UI local, entrypoint e resumo de preflight.

### Task 2: Projeção SQLite e reconciliação

**Files:**
- Create: `app/src/store.mjs`
- Create: `app/test/store.test.mjs`
- Modify: `app/package.json`

**Interfaces:** `createStore({ dbPath, rootDir })`, `store.syncFromFiles()`, `store.getSnapshot()`, `store.close()`.

- [ ] Escrever testes para criação de schema, importação dos JSONs, divergência e ausência de segredos.
- [ ] Rodar `npm test` e observar falha por módulo inexistente.
- [ ] Implementar schema mínimo com `runs`, `operations`, `queue_items`, `applications`, `approvals`, `domain_events` e `failures`.
- [ ] Rodar suíte completa e confirmar verde.

### Task 3: Campanha e fila

**Files:**
- Create: `app/src/queue-service.mjs`
- Create: `app/test/queue-service.test.mjs`
- Modify: `app/src/http-server.mjs`

**Interfaces:** `listQueue()`, `addQueueItem(input)`, `claimNext({ platform })`, `recordQueueFailure(id, error)`.

- [ ] Testar deduplicação por `key` e fingerprint, filtros de meta, ordenação A/B/C, aderência, prazo e limite de falhas.
- [ ] Observar RED.
- [ ] Implementar serviço e endpoints `GET /api/v1/queue`, `POST /api/v1/queue/items`, `POST /api/v1/queue/:id/claim`.
- [ ] Observar GREEN e atualizar dashboard com próxima ação.

### Task 4: Runs, eventos, locks e checkpoint

**Files:**
- Create: `app/src/run-service.mjs`
- Create: `app/src/lock.mjs`
- Create: `app/test/run-service.test.mjs`
- Modify: `app/src/http-server.mjs`

**Interfaces:** `startRun(input)`, `pauseRun(id, reason)`, `resumeRun(id)`, `appendEvent(event)`, `reconcile()`.

- [ ] Testar lock único, idempotência, `MAX_APPLICATIONS_PER_RUN`, `MAX_CONSECUTIVE_FAILURES`, stale checkpoint e retomada.
- [ ] Observar RED.
- [ ] Implementar serviços e endpoints de runs, eventos e checkpoint.
- [ ] Observar GREEN.

### Task 5: Aprovação e política

**Files:**
- Create: `app/src/policy.mjs`
- Create: `app/src/approval-service.mjs`
- Create: `app/test/policy.test.mjs`
- Create: `app/test/approval-service.test.mjs`
- Modify: `app/src/http-server.mjs`

**Interfaces:** `evaluateAction(action, context)`, `requestApproval(input)`, `decideApproval(id, decision)`.

- [ ] Testar bloqueio de envio sem aprovação, hash inválido, expiração, MFA/CAPTCHA, dados sensíveis e testes cronometrados.
- [ ] Observar RED.
- [ ] Implementar policy gateway e endpoints `GET /api/v1/approvals` e `POST /api/v1/approvals/:id/decision`.
- [ ] Observar GREEN.

### Task 6: Script Adapter e exportação

**Files:**
- Create: `app/src/script-adapter.mjs`
- Create: `app/src/export-service.mjs`
- Create: `app/test/script-adapter.test.mjs`
- Create: `app/test/export-service.test.mjs`
- Modify: `app/src/http-server.mjs`

**Interfaces:** `runAllowedScript(name, args)`, `createShareableExport(rootDir, destination)`.

- [ ] Testar allowlist, argumentos sem concatenação, redaction, backup, exit code e ausência de arquivos privados no ZIP.
- [ ] Observar RED.
- [ ] Implementar adapter e `POST /api/v1/exports/shareable`.
- [ ] Observar GREEN.

### Task 7: Agent/Browser adapters simuláveis

**Files:**
- Create: `app/src/agent-adapter.mjs`
- Create: `app/src/browser-adapter.mjs`
- Create: `app/test/agent-browser-adapters.test.mjs`

**Interfaces:** `createAgentAdapter()`, `createBrowserAdapter()`, `snapshot()`, `prepareApplication()`, `verifySubmission()`.

- [ ] Testar lifecycle initialize/thread/turn, snapshot obrigatório, bloqueio em CAPTCHA/MFA e confirmação visual simulada.
- [ ] Observar RED.
- [ ] Implementar interfaces fake e contratos para integração real posterior.
- [ ] Observar GREEN.

### Task 8: Integração do fluxo e E2E simulado

**Files:**
- Create: `app/test/flow.e2e.test.mjs`
- Modify: `app/src/main.mjs`
- Modify: `app/public/index.html`
- Modify: `app/public/app.js`

- [ ] Testar preflight → fila → claim → preparação → aprovação → confirmação simulada → registro → painel.
- [ ] Observar RED.
- [ ] Integrar serviços e estados na UI.
- [ ] Observar GREEN e rodar a suíte completa.

## Verificação final

- [ ] `npm test -- --test-reporter=spec` passa sem falhas.
- [ ] `node --check` passa em todos os `.mjs` e `.js`.
- [ ] `npm start` responde em `127.0.0.1`.
- [ ] Não há execução real de candidatura nos testes.
- [ ] `git status` da worktree está limpo após commit.
