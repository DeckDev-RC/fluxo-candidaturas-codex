# App Harness PRD/SDD Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Fechar as lacunas de segurança, integridade, fluxo, interface, métricas e verificação do App Harness exclusivamente dentro de `Fluxo/`.

**Architecture:** O HTTP server continuará sendo a única entrada da UI e usará uma camada única de mutação para autenticação local, CSRF, lock, operação persistida, backup/hash e envelope de resposta. O JSON existente continuará como fonte operacional; SQLite armazenará operações, runs, eventos e projeções. A UI consumirá SSE e permanecerá incapaz de executar shell, Playwright ou App Server diretamente.

**Tech Stack:** Node.js 24+, `node:test`, `node:sqlite`, HTTP nativo, PowerShell allowlist, Playwright CLI, HTML/CSS/JavaScript sem dependências adicionais.

**Spec:** `docs/PRD-APP-HARNESS.md` e `docs/SDD-APP-HARNESS.md`

## Global Constraints

- Trabalhar somente em `Fluxo/` e na worktree isolada.
- Nenhum teste pode acessar uma conta ou enviar candidatura real.
- `REQUIRE_FINAL_CONFIRMATION=true` permanece padrão e nunca é dispensado por automação.
- JSONs existentes continuam fonte operacional durante a compatibilidade.
- Toda mutação passa por lock local, validação, operação persistida e escrita atômica.
- Segredos não entram em resposta, evento, log, métrica ou exportação.
- Toda alteração de produção começa por teste que falha.

### Task 1: Segurança de sessão, CSP e envelope HTTP — concluída

**Files:**
- Create: `app/src/session-auth.mjs`
- Modify: `app/src/http-server.mjs`
- Modify: `app/public/app.js`
- Test: `app/test/security-api.test.mjs`

- [ ] Escrever testes para token de sessão, rejeição sem token, CSRF inválido, cabeçalho CSP e envelope com `request_id`.
- [ ] Rodar `npm test -- --test-name-pattern="session token|CSRF|CSP|request_id"` e confirmar RED.
- [ ] Implementar sessão aleatória somente em memória, cookie `HttpOnly; SameSite=Strict`, bootstrap GET local, Origin/CSRF para mutações e CSP sem `unsafe-eval`.
- [ ] Alterar o frontend para enviar o token CSRF recebido pelo bootstrap.
- [ ] Rodar o teste direcionado e a suíte completa; confirmar GREEN.

### Task 2: Orquestrador de mutações e reconciliação — concluída

**Files:**
- Create: `app/src/mutation-runner.mjs`
- Modify: `app/src/store.mjs`
- Modify: `app/src/http-server.mjs`
- Modify: `app/src/lock.mjs`
- Test: `app/test/mutation-runner.test.mjs`

- [ ] Escrever teste para `pending → running → succeeded`, erro em `needs_reconcile`, hashes antes/depois, backup e bloqueio do agregado.
- [ ] Rodar o teste e confirmar RED.
- [ ] Implementar `runMutation({aggregateType, aggregateId, execute, readTarget})`, persistir operação e executar sob lock.
- [ ] Implementar backup `.bak`, validação de hash/JSON, `reconcile` e bloqueio até resolução.
- [ ] Fazer todas as rotas mutáveis retornarem `{request_id,event_ids,state,data}` e erros `{code,message,retryable,actionRequired,request_id}`.
- [ ] Rodar testes direcionados e suíte completa; confirmar GREEN.

### Task 3: Configurações e workflow de candidatura — concluída

**Files:**
- Modify: `app/src/application-flow.mjs`
- Modify: `app/src/runtime-config.mjs`
- Modify: `app/src/queue-service.mjs`
- Modify: `app/src/onboarding-service.mjs`
- Modify: `app/public/index.html`
- Modify: `app/public/app.js`
- Test: `app/test/config-workflow.test.mjs`

- [ ] Escrever testes para limite por run, `CHECKPOINT_AFTER_EACH_ACTION`, `EVIDENCE_MODE`, período, exclusões e seleção de fila.
- [ ] Rodar o teste e confirmar RED.
- [ ] Aplicar os limites no fluxo antes de claim/envio, salvar checkpoint somente conforme configuração e rejeitar exclusões.
- [ ] Adicionar ao onboarding período, filtros, exclusões e controles operacionais sem aceitar credenciais.
- [ ] Adicionar UI para adicionar/pesquisar vaga e próxima ação.
- [ ] Rodar testes e confirmar GREEN.

### Task 4: Persistência Playwright/App Server e streaming UI — concluída

**Files:**
- Modify: `app/src/run-service.mjs`
- Modify: `app/src/agent-adapter.mjs`
- Modify: `app/src/http-server.mjs`
- Modify: `app/src/application-flow.mjs`
- Modify: `app/src/browser-adapter.mjs`
- Modify: `app/public/index.html`
- Modify: `app/public/app.js`
- Test: `app/test/streaming-workflow.test.mjs`

- [ ] Escrever teste para persistir `agent_thread_id`/`current_turn_id`, notificação delta, SSE e snapshot após interação.
- [ ] Rodar o teste e confirmar RED.
- [ ] Persistir thread/turn no run antes de liberar a execução, publicar notificações com `run_id` e manter SSE conectado.
- [ ] Usar `EventSource` na UI para renderizar etapa, progresso, pausa, erro e reconciliação.
- [ ] Exigir snapshot antes/depois de mudanças e comparar URL/etapa com checkpoint.
- [ ] Rodar testes e confirmar GREEN.

### Task 5: Evidências, questionários e aprovação completa — concluída

**Files:**
- Modify: `app/src/evidence-service.mjs`
- Modify: `app/src/browser-adapter.mjs`
- Modify: `app/src/assessment-service.mjs`
- Modify: `app/src/application-service.mjs`
- Modify: `app/public/index.html`
- Modify: `app/public/app.js`
- Test: `app/test/evidence-assessment-approval.test.mjs`

- [ ] Escrever testes para arquivo de evidência ausente, hash SHA-256, associação a evento/candidatura, questionário com pausa informativa e diff de aprovação.
- [ ] Rodar o teste e confirmar RED.
- [ ] Validar captura, existência, destino e hash da evidência antes de registrar `enviada`.
- [ ] Persistir questionário, autoria, duração, pausa, respostas e resultado sem autoenvio.
- [ ] Exibir na aprovação empresa, cargo, plataforma, URL/ID, currículo, respostas, salário, modalidade, anexos, sensíveis, hash, diff e validade.
- [ ] Rodar testes e confirmar GREEN.

### Task 6: Interface operacional e acompanhamento — concluída

**Files:**
- Modify: `app/public/index.html`
- Modify: `app/public/app.js`
- Modify: `app/public/styles.css`
- Modify: `app/src/metrics-service.mjs`
- Modify: `app/src/pending-service.mjs`
- Test: `app/test/operations-ui.test.mjs`

- [ ] Escrever teste de contrato para telas de fila, candidatura, importação, acompanhamento, questionário, aprovação e métricas.
- [ ] Rodar o teste e confirmar RED.
- [ ] Implementar formulários/estados sem chamada direta a scripts, com mensagens textuais e foco acessível.
- [ ] Exibir pendências, mensagens, entrevistas, testes, propostas, rejeições e sem retorno.
- [ ] Calcular tempos, taxas, falhas, bloqueios, retomadas, evidência e erros de revisão.
- [ ] Rodar testes e confirmar GREEN.

### Task 7: Autorização completa das operações e importação — concluída

**Files:**
- Modify: `app/src/legacy-import-service.mjs`
- Modify: `app/src/export-service.mjs`
- Modify: `app/src/follow-up-service.mjs`
- Modify: `app/src/message-service.mjs`
- Modify: `app/src/http-server.mjs`
- Test: `app/test/mutation-integration.test.mjs`

- [ ] Escrever teste de que importação, eventos, mensagens e exportação passam pela operação persistida, lock e reconciliação.
- [ ] Rodar o teste e confirmar RED.
- [ ] Integrar todos os serviços ao `mutation-runner`, normalizar resultados e impedir nova mutação de agregado bloqueado.
- [ ] Adicionar UI de importação, eventos de acompanhamento e rascunhos sem envio.
- [ ] Rodar testes e confirmar GREEN.

### Task 8: E2E final, acessibilidade e documentação — concluída

**Files:**
- Create: `app/test/flow.e2e.test.mjs`
- Modify: `app/README.md`
- Modify: `docs/PRD-APP-HARNESS.md`
- Modify: `docs/SDD-APP-HARNESS.md`

- [ ] Escrever E2E com fixture local cobrindo onboarding, preflight, vaga, aderência, claim, run, thread, SSE, aprovação, evidência, resultado, acompanhamento, reconciliação e exportação sanitizada.
- [ ] Rodar o E2E e confirmar RED.
- [ ] Integrar o cenário completo sem rede externa e sem candidatura real.
- [ ] Rodar suíte, `node --check`, smoke Playwright com console, `git diff --check` e validar ausência de segredos.
- [ ] Atualizar PRD/SDD com decisões implementadas e limitações remanescentes.
- [ ] Rodar a verificação final e confirmar GREEN.

## Verification Matrix

- [x] `npm test -- --test-reporter=spec` sem falhas.
- [x] `node --check` em todos os `.mjs`/`.js`.
- [ ] Smoke local em `127.0.0.1` com Playwright e console sem erros/avisos.
- [ ] E2E somente com fixtures.
- [ ] `git diff --check` limpo.
- [ ] Nenhum arquivo fora de `Fluxo/` alterado.
