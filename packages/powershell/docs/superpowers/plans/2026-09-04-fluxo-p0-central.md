# Fluxo P0 — Plano Central de Consolidação e Produto

> **Para agentes de implementação:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recomendado) ou `executing-plans` para executar este plano tarefa por tarefa. As etapas usam `- [ ]` para acompanhamento.

**Objetivo:** transformar o pacote local de candidaturas em um produto local-first coerente, seguro, retomável e distribuível, preservando compatibilidade com PowerShell, Playwright e Codex durante a migração.

**Arquitetura:** monólito modular local com UI web local, backend Node.js, SQLite como autoridade do domínio após a migração P0 e adapters para JSON/Markdown, PowerShell, Playwright, Codex e cada plataforma. O fluxo de candidatura será protegido por máquina de estados, Policy Gateway e Process Manager/Saga com checkpoints, aprovações, evidências e eventos.

**Stack:** Node.js >= 24, JavaScript ESM inicialmente, SQLite (`node:sqlite`), HTTP local em `127.0.0.1`, SSE, HTML/CSS/JavaScript no frontend, PowerShell, Playwright CLI e Codex App Server via transporte stdio.

**Especificação:** `docs/PRD-APP-HARNESS.md` e `docs/SDD-APP-HARNESS.md`.

## Restrições globais

- O produto permanece local-first e single-user no P0.
- O servidor deve escutar somente em `127.0.0.1`.
- A UI nunca chama PowerShell, Playwright ou Codex diretamente; usa a API local.
- `.env`, senhas, tokens, cookies, MFA, currículo real e perfil privado nunca entram em payload, log, evento ou exportação compartilhável.
- `REQUIRE_FINAL_CONFIRMATION=true` é o padrão.
- `ALLOW_AUTOMATED_SUBMISSION` nunca libera decisão sensível, legal, salarial ou de autoria pessoal.
- Nenhum comando recebido pela UI pode ser concatenado em shell.
- Scripts executáveis são definidos por allowlist e argumentos são passados como lista.
- CAPTCHA, MFA, biometria, testes fiscalizados e decisões sensíveis exigem intervenção do usuário.
- Uma candidatura só pode ficar `enviada` com confirmação visual, timestamp e evidência verificável.
- Uma tentativa, rascunho, falha ou bloqueio não conta para a meta.
- Não haverá microserviços, SaaS multiusuário ou execução remota no P0.
- Testes E2E não acessam contas reais nem enviam candidaturas reais.
- Toda mutação local deve ser atômica, serializada, auditável e recuperável.
- O estado observado no navegador prevalece sobre checkpoint antigo quando houver divergência.

## Protocolo obrigatório de execução das tarefas

- [ ] Antes de alterar código, criar ou atualizar o teste que expressa o comportamento esperado.
- [ ] Executar o teste direcionado e confirmar que ele falha pelo motivo esperado.
- [ ] Implementar a menor mudança que satisfaz o teste.
- [ ] Executar o teste direcionado novamente e confirmar aprovação.
- [ ] Executar `npm test` e os validadores PowerShell afetados.
- [ ] Revisar diff, caminhos privados, redaction e compatibilidade antes de marcar a tarefa.
- [ ] Fazer um commit pequeno e descritivo ao concluir cada tarefa independente.

## Resultado esperado do P0

- [ ] A branch de produto contém o App Harness e o pacote PowerShell sem arquivos essenciais ausentes.
- [ ] Existe uma única definição executável das transições de candidatura, fila, execução e aprovação.
- [ ] SQLite é a fonte de verdade do domínio; JSON/Markdown são compatibilidade e exportação controladas.
- [ ] O Autopilot usa ferramentas de domínio explicitamente registradas, sem shell genérico.
- [ ] Discovery, candidatura e acompanhamento têm adapters reais isolados por plataforma.
- [ ] O app consegue pausar, retomar, reconciliar e explicar qualquer execução interrompida.
- [ ] O dashboard local possui rotas e módulos separados por área de produto.
- [ ] O fluxo de segurança, evidência, exportação e logs está testado.
- [ ] Existe um comando único para iniciar, diagnosticar, testar e empacotar o app.
- [ ] A distribuição desktop pode ser adicionada sem reescrever o backend ou a UI.

---

## Fase 0 — Baseline, branch e higiene do repositório

### Tarefa 0.1: escolher a linha de produto

**Arquivos:**

- Consultar: `README.md`, `app/README.md` no worktree `app-harness-state-mvp`, `docs/PRD-APP-HARNESS.md`, `docs/SDD-APP-HARNESS.md`.
- Modificar: `README.md` e `CHANGELOG.md` após a decisão de integração.

**Interfaces:**

- Entrada: pacote file-based da branch principal e App Harness do worktree.
- Saída: uma branch de produto contendo uma única referência oficial para executar o app.

Checklist:

- [ ] Confirmar que `codex/app-harness-state-mvp` é a base do produto P0.
- [ ] Integrar o conteúdo do App Harness em uma branch de trabalho limpa.
- [ ] Preservar alterações locais existentes; não usar `git reset --hard` nem descartar arquivos sem decisão explícita.
- [ ] Restaurar `AGENTS.md`, pois `scripts/validar.ps1` e a operação documentada dependem dele.
- [ ] Decidir o destino do arquivo `.md` sem nome convencional na raiz.
- [ ] Separar arquivos de produto, dados privados, artefatos de teste e artefatos gerados.
- [ ] Atualizar o README para informar qual comando inicia o app local.
- [ ] Registrar a decisão e os arquivos incorporados no `CHANGELOG.md`.

Validação:

- [ ] `git status --short --branch` mostra apenas mudanças deliberadas.
- [ ] `Test-Path AGENTS.md` retorna verdadeiro.
- [ ] `.\scripts\validar.ps1` executa sem falha estrutural quando os dados privados válidos estiverem presentes.
- [ ] `git ls-tree -r --name-only HEAD` contém `app/package.json`, `app/src` e `app/test`.

### Tarefa 0.2: congelar o contrato de execução

**Arquivos:**

- Criar: `docs/CONTRATO-DE-EXECUCAO.md`.
- Modificar: `app/README.md`, `README.md`, `.env.example`.
- Testar: `app/test/startup.test.mjs`, `app/test/runtime-config.test.mjs`.

Checklist:

- [ ] Documentar Node.js >= 24, PowerShell, `npx`, Codex CLI e Playwright.
- [ ] Documentar que a UI roda localmente e que a porta padrão é `4173`.
- [ ] Documentar `FLUXO_ROOT` e `PORT` como variáveis de inicialização não sensíveis.
- [ ] Documentar os modos `chatgpt`, `api-key`, fixture e offline.
- [ ] Documentar que fixture nunca representa candidatura real.
- [ ] Documentar o comportamento quando o Codex, Playwright ou internet estiverem indisponíveis.
- [ ] Documentar os arquivos gerados em `estado/` e que eles não entram no Git.

Validação:

- [ ] O teste de startup confirma a porta local, o root configurável e o encerramento limpo.
- [ ] O teste de runtime confirma que controles sensíveis não são expostos.

---

## Fase 1 — Domínio, estados e invariantes

### Tarefa 1.1: criar o núcleo de domínio

**Arquivos:**

- Criar: `app/src/domain/application-status.mjs`.
- Criar: `app/src/domain/queue-status.mjs`.
- Criar: `app/src/domain/run-status.mjs`.
- Criar: `app/src/domain/approval-status.mjs`.
- Criar: `app/src/domain/errors.mjs`.
- Testar: `app/test/domain-status.test.mjs`.

**Interfaces:**

- `canTransitionApplication(from, to, context) -> { allowed: boolean, reason?: string }`.
- `transitionApplication(application, to, context) -> application`.
- `canTransitionQueue(from, to, context) -> { allowed: boolean, reason?: string }`.
- `canTransitionRun(from, to, context) -> { allowed: boolean, reason?: string }`.
- `createDomainError(code, message, details?) -> Error`.

Checklist:

- [ ] Definir todos os status existentes sem duplicar strings em serviços.
- [ ] Proibir `enviada` sem `confirmation.confirmed === true`.
- [ ] Proibir `enviada` sem evidência quando `EVIDENCE_MODE=confirmation`.
- [ ] Proibir envio sem aprovação válida quando a política exigir confirmação.
- [ ] Proibir item de fila bloqueado ou fora da meta de ser reivindicado.
- [ ] Proibir execução interrompida de ser retomada sem reconciliação quando o checkpoint divergir.
- [ ] Proibir aprovação expirada, rejeitada ou com payload alterado.
- [ ] Validar que transições terminais não retornem para estados ativos.
- [ ] Emitir erros com códigos estáveis para a API e para a UI.

Validação:

- [ ] Criar testes de todas as transições válidas.
- [ ] Criar testes para cada transição inválida e seu código de erro.
- [ ] Criar teste específico para impedir gravação direta de `enviada`.
- [ ] `npm test -- --test-name-pattern="domain"` passa.

### Tarefa 1.2: centralizar Policy Gateway

**Arquivos:**

- Modificar: `app/src/policy.mjs`.
- Modificar: `app/src/application-flow.mjs`.
- Modificar: `app/src/approval-service.mjs`.
- Modificar: `app/src/assessment-service.mjs`.
- Modificar: `app/src/message-service.mjs`.
- Testar: `app/test/policy.test.mjs`, `app/test/application-flow.test.mjs`.

Checklist:

- [ ] Fazer todos os casos de uso consultarem a mesma política.
- [ ] Diferenciar submissão, dado sensível, teste cronometrado, mensagem e desistência.
- [ ] Vincular aprovação ao hash do payload completo e à versão da ação.
- [ ] Invalidar aprovação quando qualquer campo revisável mudar.
- [ ] Garantir que o agente possa pedir aprovação, mas não decidir a aprovação.
- [ ] Garantir que a UI possa aprovar, mas não produzir confirmação visual falsa.
- [ ] Registrar ator, timestamp e motivo em cada decisão.

Validação:

- [ ] Testar aprovação, rejeição, expiração e alteração de payload.
- [ ] Testar que uma ação sensível sempre pausa antes da execução.
- [ ] Testar que mensagem e teste cronometrado não usam a aprovação de submissão.

### Tarefa 1.3: transformar o fluxo em Process Manager/Saga

**Arquivos:**

- Criar: `app/src/application/application-process-manager.mjs`.
- Modificar: `app/src/application-flow.mjs`.
- Modificar: `app/src/run-service.mjs`.
- Modificar: `app/src/checkpoint-service.mjs`.
- Testar: `app/test/application-process-manager.test.mjs`.

**Interface:**

- `startApplicationProcess({ queueItemId, platform }) -> Promise<{ run, state }>`.
- `advanceApplicationProcess(runId, command) -> Promise<{ run, state, events }>`.
- `resumeApplicationProcess(runId, observedBrowserState) -> Promise<{ run, state }>`.
- `pauseApplicationProcess(runId, reason) -> Promise<{ run, state }>`.

Checklist:

- [ ] Modelar explicitamente `claimed`, `observed`, `filled`, `approval_pending`, `approved`, `submitting`, `confirmed`, `recorded`, `paused`, `needs_reconcile`.
- [ ] Salvar checkpoint antes de cada portão de usuário.
- [ ] Salvar checkpoint após mudança de etapa quando configurado.
- [ ] Persistir o comando atual, a tentativa e o resultado observado.
- [ ] Impedir repetição cega de clique ou envio.
- [ ] Retomar somente depois de comparar tela atual, URL, página e item reivindicado.
- [ ] Registrar falha recuperável e falha bloqueante separadamente.
- [ ] Definir como liberar ou manter a reserva da vaga em cada falha.

Validação:

- [ ] Testar retomada após encerramento durante preenchimento.
- [ ] Testar retomada após aprovação antes do envio.
- [ ] Testar divergência de URL e divergência de etapa.
- [ ] Testar que uma confirmação já existente não causa segundo envio.

---

## Fase 2 — Persistência e integridade

### Tarefa 2.1: definir portas de persistência

**Arquivos:**

- Criar: `app/src/ports/repositories.mjs`.
- Criar: `app/src/ports/state-store.mjs`.
- Criar: `app/src/adapters/persistence/json-compatibility-repository.mjs`.
- Criar: `app/src/adapters/persistence/sqlite-repository.mjs`.
- Testar: `app/test/repository-contract.test.mjs`.

Checklist:

- [ ] Definir operações para campanha, fila, candidatura, execução, aprovação, evidência e eventos.
- [ ] Fazer JSON/Markdown implementar somente compatibilidade e importação/exportação.
- [ ] Fazer SQLite implementar a fonte de verdade transacional do domínio.
- [ ] Não persistir `.env`, senha, token, cookie, MFA ou storage state em SQLite.
- [ ] Preservar histórico, evidência, currículo utilizado e próxima ação.
- [ ] Criar migrações versionadas para o schema SQLite.
- [ ] Adicionar constraints únicas para chave de vaga e candidatura.
- [ ] Adicionar índices por status, plataforma, prazo e execução.

Validação:

- [ ] Rodar os mesmos testes de contrato contra adapter SQLite e fixture JSON.
- [ ] Testar reinício do processo sem perda de eventos ou aprovações.
- [ ] Testar que uma transação incompleta não deixa candidatura parcialmente registrada.

### Tarefa 2.2: migrar autoridade de JSON para SQLite

**Arquivos:**

- Modificar: `app/src/store.mjs`.
- Modificar: `app/src/state-reader.mjs`.
- Criar: `app/src/migrations/001-domain-authority.mjs`.
- Criar: `app/src/services/reconciliation-service.mjs`.
- Modificar: `app/src/http-server.mjs`.
- Testar: `app/test/migration-reconciliation.test.mjs`, `app/test/store.test.mjs`.

Checklist:

- [ ] Ler os JSONs existentes sem sobrescrevê-los na primeira execução.
- [ ] Criar backup antes de qualquer migração destrutiva ou substituição.
- [ ] Importar campanha, fila e candidaturas preservando IDs e datas.
- [ ] Comparar contagens, chaves, status, histórico e evidências antes de ativar a nova autoridade.
- [ ] Exibir divergência como bloqueio de mutação, nunca resolver silenciosamente.
- [ ] Exportar JSON/Markdown compatíveis a partir do SQLite após a migração.
- [ ] Manter rollback para os arquivos anteriores.
- [ ] Adicionar flag local de compatibilidade enquanto a migração estiver em observação.

Validação:

- [ ] Migrar uma fixture com duplicatas, evidência, status terminal e checkpoint.
- [ ] Alterar um JSON externamente e confirmar que a reconciliação detecta o hash.
- [ ] Confirmar que o app não sobrescreve o JSON divergente automaticamente.
- [ ] Confirmar equivalência entre painel exportado e projeção SQLite.

### Tarefa 2.3: corrigir lock e recuperação

**Arquivos:**

- Modificar: `app/src/lock.mjs`.
- Criar: `app/src/adapters/system/process-liveness.mjs`.
- Modificar: `app/src/runtime.mjs`.
- Testar: `app/test/lock-recovery.test.mjs`.

Checklist:

- [ ] Manter exclusão mútua entre mutações concorrentes.
- [ ] Detectar lock órfão após encerramento abrupto.
- [ ] Registrar PID, horário, versão e operação no lock.
- [ ] Verificar se o PID ainda existe antes de liberar lock automaticamente.
- [ ] Exigir confirmação quando o lock tiver metadados inconsistentes.
- [ ] Garantir liberação em encerramento normal.
- [ ] Impedir duas instâncias apontando para a mesma raiz sem aviso explícito.

Validação:

- [ ] Testar duas mutações simultâneas.
- [ ] Testar lock criado por PID inexistente.
- [ ] Testar lock criado por PID ativo.
- [ ] Testar encerramento normal e recuperação posterior.

---

## Fase 3 — Adapters externos e Autopilot

### Tarefa 3.1: criar contratos de adapters

**Arquivos:**

- Criar: `app/src/ports/browser-port.mjs`.
- Criar: `app/src/ports/agent-port.mjs`.
- Criar: `app/src/ports/platform-adapter.mjs`.
- Criar: `app/src/ports/script-runner.mjs`.
- Modificar: `app/src/agent-contracts.mjs`.
- Testar: `app/test/adapter-contracts.test.mjs`.

Interfaces:

- `BrowserPort.snapshot(context) -> Promise<ObservedBrowserState>`.
- `BrowserPort.fill(field, value) -> Promise<ObservedBrowserState>`.
- `BrowserPort.submit(ref) -> Promise<SubmissionObservation>`.
- `BrowserPort.captureEvidence(context) -> Promise<EvidenceReference>`.
- `AgentPort.startThread(context) -> Promise<ThreadReference>`.
- `AgentPort.runTurn(threadId, input, options) -> Promise<TurnReference>`.
- `PlatformAdapter.search(criteria) -> Promise<Opportunity[]>`.
- `PlatformAdapter.status(application) -> Promise<FollowUpEvent[]>`.

Checklist:

- [ ] Definir esquemas de entrada e saída sem depender de objetos livres.
- [ ] Validar respostas externas antes de gravar no domínio.
- [ ] Redigir campos sensíveis na fronteira do adapter.
- [ ] Diferenciar estado observado, inferência do agente e confirmação do usuário.
- [ ] Definir resultado `unavailable`, `manual_intervention`, `retryable` e `confirmed`.
- [ ] Garantir que fixture e produção implementem o mesmo contrato.

### Tarefa 3.2: expor ferramentas de domínio ao agente

**Arquivos:**

- Criar: `app/src/agent/domain-tools.mjs`.
- Criar: `app/src/agent/tool-registry.mjs`.
- Modificar: `app/src/stdio-agent-transport.mjs`.
- Modificar: `app/src/agent-adapter.mjs`.
- Modificar: `app/src/runtime.mjs`.
- Testar: `app/test/agent-tools.test.mjs`, `app/test/stdio-agent-transport.test.mjs`.

Checklist:

- [ ] Registrar somente ferramentas de domínio: leitura de estado, fila, perfil, currículo, navegador, aprovação, evidência, checkpoint e eventos.
- [ ] Não registrar shell genérico, escrita arbitrária ou acesso livre ao `.env`.
- [ ] Validar parâmetros antes de executar qualquer ferramenta.
- [ ] Filtrar os campos do perfil entregues para cada tarefa.
- [ ] Redigir segredos antes de cada chamada ao agente.
- [ ] Forçar uso de `approval.request` para ações sensíveis.
- [ ] Forçar `record_confirmation` a aceitar somente observação do Browser Adapter ou evidência revisada.
- [ ] Persistir `thread_id`, `turn_id`, ferramenta, entrada segura e resultado seguro.
- [ ] Tornar indisponibilidade do agente um estado recuperável, não sucesso simulado.

Validação:

- [ ] Testar que ferramenta desconhecida é rejeitada.
- [ ] Testar que payload com senha, token ou cookie não atravessa o adapter.
- [ ] Testar que o agente não consegue definir `status=enviada` diretamente.
- [ ] Testar que um turn é retomável após reinício.

### Tarefa 3.3: implementar discovery e acompanhamento reais por adapter

**Arquivos:**

- Criar: `app/src/adapters/platforms/gupy-adapter.mjs`.
- Criar: `app/src/adapters/platforms/infojobs-adapter.mjs`.
- Criar: `app/src/adapters/platforms/pandape-adapter.mjs`.
- Criar: `app/src/adapters/platforms/linkedin-adapter.mjs`.
- Criar: `app/src/adapters/platforms/catho-adapter.mjs`.
- Criar: `app/src/adapters/platforms/vagascom-adapter.mjs`.
- Criar: `app/src/adapters/platforms/solides-adapter.mjs`.
- Criar: `app/src/adapters/platforms/platform-registry.mjs`.
- Modificar: `app/src/discovery-service.mjs`.
- Modificar: `app/src/follow-up-monitor.mjs`.
- Testar: `app/test/platform-adapter-contract.test.mjs`, `app/test/discovery-real-fixture.test.mjs`.

Checklist:

- [ ] Derivar URLs, modo de autenticação e playbook de `config/plataformas.json`.
- [ ] Implementar parsing de snapshot/DOM por plataforma sem misturar parsing com orquestração.
- [ ] Normalizar título, empresa, identificador, localização, modalidade, salário, requisitos e prazo.
- [ ] Preservar origem e evidência da observação.
- [ ] Deduplicar por plataforma + identificador e por empresa + cargo.
- [ ] Registrar falha por plataforma sem cancelar as demais.
- [ ] Implementar consulta de status como adapter separado da descoberta.
- [ ] Fazer o runtime registrar adapters reais em vez de `adapters: {}` vazio.
- [ ] Manter fixtures como ambiente de teste claramente sinalizado.
- [ ] Parar quando a plataforma exigir login, CAPTCHA, MFA ou intervenção manual.

Validação:

- [ ] Criar fixtures HTML/snapshot representativas para cada plataforma.
- [ ] Testar parsing, deduplicação, redirecionamento e ausência de campos.
- [ ] Testar que nenhum teste acessa contas reais.
- [ ] Testar falha isolada de uma plataforma e retomada somente dela.

---

## Fase 4 — API e backend modular

### Tarefa 4.1: dividir o servidor HTTP

**Arquivos:**

- Criar: `app/src/interfaces/http/router.mjs`.
- Criar: `app/src/interfaces/http/middleware/auth.mjs`.
- Criar: `app/src/interfaces/http/middleware/mutation.mjs`.
- Criar: `app/src/interfaces/http/controllers/state-controller.mjs`.
- Criar: `app/src/interfaces/http/controllers/campaign-controller.mjs`.
- Criar: `app/src/interfaces/http/controllers/queue-controller.mjs`.
- Criar: `app/src/interfaces/http/controllers/application-controller.mjs`.
- Criar: `app/src/interfaces/http/controllers/run-controller.mjs`.
- Criar: `app/src/interfaces/http/controllers/operations-controller.mjs`.
- Criar: `app/src/interfaces/http/controllers/integration-controller.mjs`.
- Modificar: `app/src/http-server.mjs`.
- Testar: testes HTTP existentes e `app/test/http-server.test.mjs`.

Checklist:

- [ ] Manter todas as rotas públicas documentadas.
- [ ] Manter envelope de mutação com `request_id`, `event_ids`, `state` e `data`.
- [ ] Centralizar tratamento de erro de domínio.
- [ ] Centralizar autenticação local, CSRF, CSP, origem e content type.
- [ ] Centralizar aquisição de lock e ciclo de operação.
- [ ] Rejeitar método, rota, payload e tamanho de corpo não suportados.
- [ ] Preservar SSE com replay de eventos desde o último ID quando possível.
- [ ] Não permitir traversal, caminho absoluto ou arquivo fora das pastas permitidas.

Validação:

- [ ] Executar todos os testes HTTP atuais sem mudança de contrato.
- [ ] Criar teste de cada controller isoladamente com services injetados.
- [ ] Testar CSRF ausente, origem inválida, método inválido e payload inválido.
- [ ] Testar reconciliação bloqueando nova mutação do agregado afetado.

### Tarefa 4.2: validação de payloads e contratos de API

**Arquivos:**

- Criar: `app/src/interfaces/http/schemas.mjs`.
- Criar: `app/src/interfaces/http/serializers.mjs`.
- Modificar: controllers da Tarefa 4.1.
- Testar: `app/test/api-contracts.test.mjs`.

Checklist:

- [ ] Validar strings, números, enumerações, listas, datas e caminhos relativos.
- [ ] Limitar tamanho de texto de notas, instruções e mensagens.
- [ ] Rejeitar campos desconhecidos em comandos sensíveis.
- [ ] Redigir campos proibidos antes de serializar resposta.
- [ ] Padronizar erros com `code`, `message`, `retryable` e `actionRequired`.
- [ ] Garantir que o serializer de estado nunca leia ou envie conteúdo privado integral.

---

## Fase 5 — Frontend operacional

### Tarefa 5.1: dividir a UI por telas e componentes

**Arquivos:**

- Criar: `app/public/js/api-client.js`.
- Criar: `app/public/js/router.js`.
- Criar: `app/public/js/state-store.js`.
- Criar: `app/public/js/views/home-view.js`.
- Criar: `app/public/js/views/setup-view.js`.
- Criar: `app/public/js/views/queue-view.js`.
- Criar: `app/public/js/views/applications-view.js`.
- Criar: `app/public/js/views/operations-view.js`.
- Criar: `app/public/js/views/followup-view.js`.
- Criar: `app/public/js/components/approval-card.js`.
- Criar: `app/public/js/components/run-stream.js`.
- Criar: `app/public/js/components/status-badge.js`.
- Modificar: `app/public/app.js`, `app/public/index.html`, `app/public/styles.css`.
- Testar: `app/test/ui-screens.test.mjs`, `app/test/ui-interactions.test.mjs`, `app/test/ui-ux.test.mjs`.

Checklist:

- [ ] Manter as seis áreas: Início, Configuração, Fila, Candidaturas, Operações e Acompanhamento.
- [ ] Remover responsabilidades de API, roteamento e renderização do arquivo monolítico.
- [ ] Exibir sempre estado, frescor dos dados, próxima ação e motivo de bloqueio.
- [ ] Manter onboarding progressivo com rascunho local e revisão final.
- [ ] Desabilitar botões durante mutações e exibir feedback de sucesso/erro.
- [ ] Mostrar aprovação como bloqueio explícito, não como botão indistinto.
- [ ] Mostrar diferença entre tentativa, candidatura confirmada e acompanhamento.
- [ ] Mostrar modo fixture de forma impossível de confundir com produção.
- [ ] Manter navegação por teclado, foco visível, labels, mensagens textuais e contraste AA.
- [ ] Usar `textContent` ou escape seguro para qualquer dado externo.
- [ ] Preservar suporte mobile básico sem priorizar layout mobile sobre desktop.

Validação:

- [ ] Testar navegação entre todas as rotas.
- [ ] Testar onboarding incompleto, inválido, salvo e retomado.
- [ ] Testar aprovação, rejeição e expiração na UI.
- [ ] Testar stream desconectado e reconexão.
- [ ] Testar que dados privados não aparecem em fixtures nem em estado público.

### Tarefa 5.2: definir estados visuais de operação

**Arquivos:**

- Criar: `app/public/ui-state-contract.md`.
- Modificar: componentes da Tarefa 5.1.
- Testar: `app/test/ui-state-contract.test.mjs`.

Checklist:

- [ ] Definir estados `loading`, `ready`, `attention`, `blocked`, `running`, `paused`, `needs_reconcile`, `error` e `offline`.
- [ ] Definir texto acionável para cada estado.
- [ ] Definir o botão permitido em cada estado.
- [ ] Não exibir “concluído” quando só houve tentativa.
- [ ] Não exibir “enviado” sem confirmação visual e evidência.
- [ ] Não simular progresso quando agente ou navegador estiver indisponível.

---

## Fase 6 — Segurança, evidência e privacidade

### Tarefa 6.1: endurecer redaction e armazenamento

**Arquivos:**

- Criar: `app/src/security/redaction.mjs`.
- Criar: `app/src/security/path-policy.mjs`.
- Modificar: `app/src/state-reader.mjs`, `app/src/script-adapter.mjs`, `app/src/audit-service.mjs`, `app/src/browser-adapter.mjs`.
- Testar: `app/test/security-redaction.test.mjs`, `app/test/security-api.test.mjs`.

Checklist:

- [ ] Redigir chaves sensíveis conhecidas e padrões de conteúdo quando aplicável.
- [ ] Não persistir stdout/stderr bruto de processos externos.
- [ ] Não persistir storage state do navegador em exportação.
- [ ] Validar caminhos relativos dentro de `curriculo/`, `evidencias/`, `mensagens/` e `output/` conforme o caso.
- [ ] Rejeitar caminho absoluto, traversal, NUL, quebra de linha e symlink fora da raiz permitida.
- [ ] Usar hash SHA-256 para evidências e arquivos relevantes.
- [ ] Manter backup antes de substituir arquivos privados.
- [ ] Não incluir memória privada integral em eventos do agente.

Validação:

- [ ] Testar senhas em objeto, texto, stdout e stderr.
- [ ] Testar traversal Windows e POSIX.
- [ ] Testar exportação sem `.env`, currículo real, perfil, fila, campanha, checkpoint e mensagens.
- [ ] Testar evidência ausente, alterada e com hash divergente.

### Tarefa 6.2: revisar autenticação local e OAuth

**Arquivos:**

- Modificar: `app/src/session-auth.mjs`, `app/src/local-auth.mjs`, `app/src/codex-auth-service.mjs`, `app/src/stdio-agent-transport.mjs`.
- Criar: `app/src/security/secret-store.mjs`.
- Testar: `app/test/auth-observability.test.mjs`, `app/test/codex-auth.test.mjs`.

Checklist:

- [ ] Manter bind loopback e verificação de origem.
- [ ] Manter cookie HttpOnly, SameSite e token CSRF.
- [ ] Evitar colocar token OAuth em URL, log ou armazenamento do app.
- [ ] Isolar `CODEX_HOME` privado do Fluxo.
- [ ] Remover chaves de API do ambiente quando `AUTH_MODE=chatgpt`.
- [ ] Definir interface para cofre de credenciais do sistema operacional.
- [ ] Não salvar senha de plataforma em texto puro quando o cofre estiver disponível.
- [ ] Manter fallback manual quando OAuth não puder iniciar.

Validação:

- [ ] Testar login, logout, sessão ausente e CSRF ausente.
- [ ] Testar que respostas OAuth não contêm tokens.
- [ ] Testar ambiente do processo agente sem chaves proibidas.

---

## Fase 7 — Qualidade, observabilidade e distribuição

### Tarefa 7.1: completar pirâmide de testes

**Arquivos:**

- Criar: `app/test/fixtures/platforms/`.
- Criar: `app/test/fixtures/runs/`.
- Criar: `app/test/test-helpers.mjs`.
- Modificar: testes existentes conforme as novas portas.
- Criar: `app/TESTING.md`.

Checklist:

- [ ] Manter testes unitários para estados, políticas, deduplicação, redaction, paths, hashes e seleção de fila.
- [ ] Manter testes de integração para SQLite, reconciliação, lock, scripts e API.
- [ ] Criar testes de contrato para todos os adapters.
- [ ] Criar E2E local com servidor, fixtures e browser driver fake.
- [ ] Criar teste de reinício com execução em cada etapa do fluxo.
- [ ] Criar teste de falha entre banco e arquivo.
- [ ] Criar teste de exportação sanitizada.
- [ ] Criar teste de limite por execução e falhas consecutivas.
- [ ] Não depender de rede ou conta real no CI.

Validação:

- [ ] `npm test` passa em ambiente limpo.
- [ ] Não existem testes que dependam do estado privado da pasta real.
- [ ] Relatório de testes identifica claramente fixture, integração local e E2E simulado.

### Tarefa 7.2: observabilidade e suporte operacional

**Arquivos:**

- Modificar: `app/src/metrics-service.mjs`, `app/src/observability.mjs`, `app/src/audit-service.mjs`.
- Criar: `docs/DIAGNOSTICO.md`.
- Testar: `app/test/observability-metrics.test.mjs`.

Checklist:

- [ ] Registrar `run_id`, `request_id`, plataforma, item, duração, tentativa e motivo de parada.
- [ ] Medir sucesso confirmado, intervenção, retry, duplicata, reconciliação e falha.
- [ ] Redigir dados privados antes de métricas e traces.
- [ ] Exibir última operação pendente e agregado bloqueado.
- [ ] Criar diagnóstico para Playwright indisponível, Codex indisponível, lock órfão e JSON inválido.
- [ ] Permitir exportar um pacote de diagnóstico sanitizado.

### Tarefa 7.3: comando único de operação

**Arquivos:**

- Criar: `scripts/iniciar-app.ps1`.
- Criar: `scripts/parar-app.ps1`.
- Criar: `scripts/diagnosticar-app.ps1`.
- Modificar: `app/package.json`, `app/README.md`, `README.md`.
- Testar: `app/test/startup.test.mjs`.

Checklist:

- [ ] `iniciar-app.ps1` validar ambiente antes de iniciar.
- [ ] Iniciar backend em loopback e abrir a UI no navegador padrão.
- [ ] Registrar PID apenas em estado local ignorado pelo Git.
- [ ] Não iniciar Playwright nem enviar ação externa automaticamente.
- [ ] `parar-app.ps1` encerrar somente o processo do app identificado pelo PID local.
- [ ] `diagnosticar-app.ps1` executar preflight, status da sessão, status do Codex e estado de reconciliação sem imprimir segredos.
- [ ] Retornar códigos de saída úteis para suporte.

---

## Fase 8 — Desktop shell sem reescrever o produto

### Tarefa 8.1: preparar o backend para empacotamento

**Arquivos:**

- Modificar: `app/src/main.mjs`, `app/src/runtime-server.mjs`.
- Criar: `app/src/packaging/runtime-paths.mjs`.
- Criar: `app/packaging/README.md`.
- Testar: `app/test/packaging-paths.test.mjs`.

Checklist:

- [ ] Separar diretório de código empacotado de diretório de dados do usuário.
- [ ] Permitir configurar root de dados fora da pasta instalada.
- [ ] Não gravar estado privado dentro de `Program Files` ou equivalente.
- [ ] Permitir escolher porta livre local.
- [ ] Expor health check para o shell desktop.
- [ ] Encerrar subprocessos Node, Codex e Playwright de forma controlada.
- [ ] Manter a API HTTP para permitir fallback de desenvolvimento no navegador.

### Tarefa 8.2: escolher e validar o shell desktop

**Decisão P0:** usar Tauri 2 como shell desktop fino, mantendo a UI web e o backend Node como sidecar local. Electron fica como fallback apenas se o empacotamento do Node >=24/`node:sqlite` inviabilizar o instalador; nesse caso, não mover regras de negócio para o renderer.

Checklist:

- [ ] Validar Tauri 2 com Node sidecar usando tamanho do instalador, compatibilidade com Node >=24, Playwright, PowerShell, Codex CLI, atualização e suporte Windows.
- [ ] Registrar Electron como fallback técnico somente se o sidecar Tauri não conseguir iniciar, atualizar ou encerrar o backend corretamente.
- [ ] Não mover regras de negócio para o renderer.
- [ ] Não habilitar Node integration irrestrita na UI.
- [ ] Usar IPC mínimo apenas para iniciar/parar backend, selecionar arquivos, notificações e abrir URLs.
- [ ] Manter CSP e origem local.
- [ ] Implementar janela de login OAuth sem reter opener ou tokens.
- [ ] Implementar tray/notificações somente depois do fluxo principal estar estável.
- [ ] Criar instalador de teste e desinstalador sem apagar dados privados sem confirmação.
- [ ] Documentar que PowerShell, Playwright e Codex continuam sendo dependências locais ou empacotadas de forma explícita.

Validação:

- [ ] Abrir o app desktop em máquina limpa de teste.
- [ ] Iniciar e parar o backend pelo shell.
- [ ] Ler dados offline.
- [ ] Executar fluxo fixture completo.
- [ ] Confirmar que atualização não apaga `estado/`, `curriculo/`, `perfil/` ou evidências.

---

## Checklist de aceite P0

### Repositório e execução

- [ ] Branch de produto limpa e documentada.
- [ ] `AGENTS.md` presente e coerente com README.
- [ ] Dados privados ignorados pelo Git.
- [ ] App Harness versionado na mesma linha de produto.
- [ ] Comando único de diagnóstico disponível.

### Domínio

- [ ] Estados centralizados.
- [ ] Transições inválidas rejeitadas.
- [ ] `enviada` exige confirmação visual e evidência.
- [ ] Aprovação vinculada a hash.
- [ ] Checkpoint e retomada são explícitos.
- [ ] Falha e bloqueio não contam como sucesso.

### Persistência

- [ ] SQLite é autoridade do domínio.
- [ ] Migração preserva IDs, datas, histórico e evidências.
- [ ] JSON/Markdown podem ser exportados novamente.
- [ ] Divergência bloqueia mutação e exige reconciliação.
- [ ] Lock órfão é recuperável.

### Integrações

- [ ] Agente usa registry de ferramentas limitado.
- [ ] Não existe shell genérico exposto ao agente.
- [ ] Browser Adapter exige snapshot e detecta desafios.
- [ ] Discovery real está isolado por plataforma.
- [ ] Follow-up real está isolado por plataforma.
- [ ] Fixtures são separadas de produção.

### Segurança

- [ ] Loopback, cookie, SameSite, HttpOnly e CSRF testados.
- [ ] Redaction testada em estado, logs, eventos, stdout e stderr.
- [ ] Caminhos absolutos e traversal rejeitados.
- [ ] Exportação sanitizada verificada por teste.
- [ ] Credenciais podem usar cofre do sistema.

### UX

- [ ] Todas as áreas possuem tela própria.
- [ ] Estados de operação são visíveis e acionáveis.
- [ ] Aprovações são claras.
- [ ] Modo fixture é evidente.
- [ ] Navegação por teclado e foco estão testados.
- [ ] A UI não afirma sucesso sem confirmação persistida.

### Qualidade

- [ ] `npm test` passa em ambiente limpo.
- [ ] Testes de integração não dependem de contas reais.
- [ ] Teste de reinício e reconciliação passa.
- [ ] Teste de exportação passa.
- [ ] Não há lint, type-check ou build ausente sem decisão documentada.
- [ ] Diagnóstico e suporte estão documentados.

## Fora do P0

- [ ] SaaS multiusuário.
- [ ] Sincronização em nuvem.
- [ ] Compartilhamento de contas entre candidatos.
- [ ] Automação de CAPTCHA, MFA, biometria ou avaliações fiscalizadas.
- [ ] Microserviços.
- [ ] Execução remota em servidor.
- [ ] Garantia de contratação ou resposta das plataformas.
- [ ] Remoção imediata dos scripts PowerShell antes da paridade comprovada.

## Ordem de execução recomendada

1. [ ] Fase 0 — baseline e integração da branch.
2. [ ] Fase 1 — estados, políticas e Process Manager.
3. [ ] Fase 2 — persistência, migração e lock.
4. [ ] Fase 3 — adapters reais e ferramentas do agente.
5. [ ] Fase 4 — API modular e contratos.
6. [ ] Fase 5 — frontend modular e estados visuais.
7. [ ] Fase 6 — segurança e evidências.
8. [ ] Fase 7 — testes, observabilidade e operação.
9. [ ] Fase 8 — shell desktop.

## Regra de conclusão

O P0 somente pode ser marcado como concluído quando todos os itens do checklist de aceite estiverem marcados, os testes passarem em ambiente limpo, a reconciliação não tiver divergências abertas e o fluxo fixture completo demonstrar onboarding, descoberta, aderência, aprovação, candidatura simulada, evidência, pausa, retomada e acompanhamento.
