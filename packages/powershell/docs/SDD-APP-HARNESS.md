# SDD — App Harness do Fluxo de Candidaturas

**Status:** contrato técnico da versão candidata 1.2
**PRD:** [`PRD-APP-HARNESS.md`](./PRD-APP-HARNESS.md)

O runtime de produção liga o Autopilot ao orquestrador com especialistas reais (Intake, Discovery, Fit, Application, Follow-up). Fixture existe só no modo `fixture` explícito e nunca é selecionado automaticamente. Ferramentas passam pelo gateway; o agente não aprova, não escreve autoridade paralela e não executa shell genérico. SQLite é a autoridade de campanha/fila/candidaturas em raízes novas. A sessão de navegador tem um dono exclusivo por vez.

> Histórico 1.1.0: Electron, Playwright direto e SQLite progressivo. Consulte [arquitetura implementada](ARQUITETURA-IMPLEMENTADA.md).

## 1. Contexto técnico

O pacote atual é orientado ao Codex: o arquivo de instruções do agente define comportamento, scripts PowerShell manipulam dados estruturados, e Playwright controla o navegador. O App Harness adicionará uma camada de interface e coordenação sem remover essa operação no primeiro release.

O sistema deve separar:

1. estado de domínio da candidatura;
2. estado da execução do agente;
3. estado observado no navegador;
4. aprovação do usuário;
5. evidência confirmada.

## 2. Decisões arquiteturais

- Aplicação local-first e single-user no MVP.
- Backend Node.js 24+ para API, eventos e coordenação, usando `node:sqlite` no MVP.
- Frontend web local para dashboard e aprovações.
- Arquivos JSON atuais como fonte operacional no MVP; SQLite como projeção, índice e armazenamento de runs/aprovações.
- Scripts PowerShell preservados como adaptadores de compatibilidade.
- Codex App Server como runtime opcional para threads, turns e eventos do agente.
- Playwright executado no ambiente local e em sessão dedicada `candidaturas`.
- `.env` lido somente no processo local; nenhum segredo atravessa a API do navegador.
- Operações externas e sensíveis sempre passam pelo Policy Gateway.

O App Server é indicado para clientes com histórico, aprovações e eventos em streaming; o SDK é mais adequado para jobs programáticos. O transporte WebSocket público fica fora do MVP, pois a documentação do App Server o classifica como experimental e recomenda não expor o transporte diretamente. [Documentação oficial](https://learn.chatgpt.com/docs/app-server)

## 3. Arquitetura lógica

```text
┌──────────────────────────────┐
│ Web UI local                 │
│ dashboard · fila · aprovação │
└──────────────┬───────────────┘
               │ HTTP + SSE
┌──────────────▼───────────────┐
│ Harness API                  │
│ auth · workflow · policy     │
│ checkpoint · idempotência    │
└───────┬──────────┬───────────┘
        │          │
┌───────▼──────┐ ┌─▼────────────────┐
│ JSON/MD      │ │ Agent Adapter    │
│ fonte atual  │ │ App Server/local │
└───────┬──────┘ └─┬────────────────┘
        │          │
┌───────▼──────┐ ┌─▼────────────────┐
│ SQLite       │ │ Playwright       │
│ projeções    │ │ sessão candidaturas│
└──────────────┘ └──────────────────┘
```

## 4. Componentes

### Web UI

Rotas mínimas:

- `/` — estado de instalação e próxima ação;
- `/campanha` — metas e filtros;
- `/fila` — vagas e aderência;
- `/execucoes/:id` — progresso, checkpoint e eventos;
- `/aprovacoes` — revisão pré-envio;
- `/candidaturas` — histórico e pendências;
- `/configuracoes` — preferências não secretas.

### Harness API

Responsável por autenticação local, validação de payloads, transições, persistência, eventos e entrega de streaming. A UI nunca chama PowerShell, Playwright ou App Server diretamente. No MVP, mutações dos dados de campanha e candidatura passam pelo File/Script Adapter para preservar a compatibilidade.

### Workflow Engine

Implementa transições permitidas e invariantes. O estado de execução e os eventos do harness são transacionais no SQLite; uma mutação em JSON feita por script é uma operação externa e precisa de confirmação/reconciliação antes de ser marcada como concluída.

### File Adapter

Lê e escreve somente formatos existentes no pacote:

- `estado/instalacao.json`;
- `estado/preflight.json` e `estado/preflight.md`;
- `estado/checkpoint.json`;
- `campanha/config.json`;
- `fila/vagas.json`;
- `candidaturas/candidaturas.json`;
- relatórios Markdown regeneráveis;
- `perfil/`, `curriculo/`, `evidencias/` e `mensagens/` conforme política de privacidade.

O adapter deve usar escrita atômica, backup local e validação antes de substituir arquivos. Em caso de divergência entre projeção e arquivo, o arquivo JSON válido prevalece e a divergência vira evento de diagnóstico.

### Script Adapter

Executa scripts já existentes por processo filho controlado, captura exit code e saída sanitizada e converte o resultado para eventos. Exemplos: `preflight.ps1`, `retomar-fluxo.ps1`, `proxima-acao.ps1`, `adicionar-vaga.ps1`, `nova-candidatura.ps1`, `registrar-evento.ps1`, `registrar-evidencia.ps1`, `registrar-falha-fila.ps1` e `gerar-painel.ps1`.

Nenhum comando recebido da UI deve ser concatenado em shell. Argumentos devem ser passados como lista e validados por allowlist.

### Agent Adapter

Mantém `thread_id` e `turn_id`, inicializa o runtime, envia tarefas e normaliza notificações. O modelo não escreve diretamente nos arquivos; usa ferramentas do harness e recebe apenas dados mínimos necessários.

### Browser Adapter

Encapsula a sessão Playwright. Deve exigir snapshot antes de uma interação, detectar mudança de página, salvar checkpoint em transições relevantes e retornar estado observado sem segredos.

### Ciclo de vida do Agent Adapter

1. Iniciar o App Server local com o diretório de trabalho do `Fluxo/`.
2. Enviar `initialize` e aguardar a confirmação de inicialização.
3. Criar ou retomar a thread associada à execução.
4. Iniciar um turn com a tarefa limitada ao estado e às ferramentas permitidas.
5. Converter notificações de progresso em eventos do harness.
6. Tratar aprovação, interrupção, erro e conclusão como estados explícitos.
7. Persistir `thread_id` e `turn_id` antes de liberar a execução para retomada.

Se o runtime do agente estiver indisponível, a UI ainda deve permitir leitura, revisão manual, preflight e reconciliação. Não deve simular progresso nem confirmação.

## 5. Modelo de dados operacional

O banco é uma projeção e índice local no MVP. Os arquivos `campanha/config.json`, `fila/vagas.json` e `candidaturas/candidaturas.json` continuam sendo a fonte operacional até a migração formal de autoridade.

```sql
create table runs (
  id text primary key,
  kind text not null, -- onboarding, campaign, application, follow_up
  status text not null,
  platform text,
  queue_reference text,
  checkpoint_path text,
  agent_thread_id text,
  current_turn_id text,
  started_at text not null,
  updated_at text not null,
  finished_at text
);

create table operations (
  id text primary key,
  run_id text,
  kind text not null,
  script_name text,
  input_json text not null,
  status text not null, -- pending, running, succeeded, failed, needs_reconcile
  exit_code integer,
  result_json text, -- somente resultado sanitizado
  safe_output text,
  before_hash text,
  after_hash text,
  started_at text not null,
  finished_at text
);

create table queue_items (
  id text primary key,
  key text not null unique,
  fingerprint text not null,
  platform text not null,
  company text not null,
  role text not null,
  identifier_or_url text not null,
  priority text not null,
  fit_score real,
  status text not null,
  attempts integer not null default 0,
  failure_count integer not null default 0,
  deadline text,
  source text,
  work_mode text,
  notes text,
  last_error text,
  added_at text not null,
  updated_at text not null
);

create table applications (
  id text primary key,
  queue_item_id text,
  key text not null unique,
  fingerprint text not null,
  platform text not null,
  company text not null,
  role text not null,
  identifier_or_url text not null,
  status text not null,
  submitted_at text,
  applied_at text,
  candidate_id text,
  resume_path text,
  work_mode text,
  next_action text,
  next_action_at text,
  deadline text,
  last_checked_at text,
  evidence_path text,
  evidence_json text not null,
  notes text,
  source text,
  history_json text not null,
  assessment_json text,
  created_at text not null,
  updated_at text not null
);

create table approvals (
  id text primary key,
  run_id text not null,
  kind text not null, -- submission, sensitive_data, timed_test, message
  payload_hash text not null,
  status text not null, -- pending, approved, rejected, expired
  decided_by text,
  expires_at text,
  created_at text not null,
  decided_at text
);

create table domain_events (
  id text primary key,
  run_id text,
  aggregate_type text not null,
  aggregate_id text not null,
  type text not null,
  payload_json text not null,
  actor_type text not null,
  created_at text not null,
  idempotency_key text unique
);

create table failures (
  id text primary key,
  run_id text,
  queue_item_id text,
  category text not null,
  message_safe text not null,
  retryable integer not null,
  attempt integer not null,
  created_at text not null
);

create index idx_queue_status_priority on queue_items(status, priority, fit_score, deadline);
create index idx_applications_platform_status on applications(platform, status);
create index idx_events_aggregate on domain_events(aggregate_type, aggregate_id, created_at);
create index idx_operations_run on operations(run_id, started_at);
```

Os arquivos do pacote continuam contendo detalhes que não devem ser duplicados no banco, como o `.env`, o currículo real e o perfil privado. O banco guarda referências, hashes, estado e metadados mínimos.

O `checkpoint.json` continua sendo a referência de retomada durante a compatibilidade. A tabela `runs` pode indexá-lo, mas não deve substituí-lo até a migração formal.

`history_json` deve preservar as mudanças existentes em `candidaturas/candidaturas.json`, incluindo tipo, status, data, nota e evidência. `applied_at` não deve ser inferido apenas do status quando o registro original já possuir uma data.

## 6. Estados e invariantes

### Instalação

- `ready` exige `preflight.json` sem pendência crítica;
- o app não inicia execução externa em `blocked`;
- `.env` nunca aparece em payload de UI ou evento.

### Fila

- `claimed` exige `run_id` e prazo de claim;
- item duplicado é rejeitado por `key`; a impressão digital empresa+cargo também bloqueia duplicidade entre plataformas, salvo autorização explícita;
- o mapeamento para os arquivos atuais usa `na fila`, `em andamento`, `processada` e `bloqueada`;
- item bloqueado não pode ser escolhido por `proxima-acao`;
- falha aumenta contador e não repete automaticamente sem regra de retry.

### Candidatura

- `enviada` exige confirmação visual, timestamp e evidência;
- `candidate_id` deve ser preservado quando a plataforma fornecer;
- currículo usado e próxima ação devem ser registrados;
- uma aplicação existente impede novo envio sem autorização explícita.

### Aprovação

- a aprovação é criada pelo backend e decidida pelo usuário na UI;
- `approval.decide` não é ferramenta do agente;
- aprovação é vinculada a `payload_hash` e expira;
- qualquer alteração após aprovação invalida o hash;
- rejeição não executa a ação.

### Compatibilidade de meta

- plataformas elegíveis são as habilitadas em `campanha/config.json` com meta positiva;
- candidaturas contam para a meta nos status definidos por `config/plataformas.json`;
- divergência entre `totalGoal` e a soma das metas de plataforma é warning no preflight e deve aparecer no painel.

### Configuração operacional

O Config Adapter deve ler, sem expor valores, as chaves de controle do `.env`: `REQUIRE_FINAL_CONFIRMATION`, `ALLOW_AUTOMATED_SUBMISSION`, `BROWSER_AUTOMATION_REQUIRED`, `PLAYWRIGHT_SESSION`, `PLAYWRIGHT_HEADLESS`, `MAX_APPLICATIONS_PER_RUN`, `MAX_CONSECUTIVE_FAILURES`, `CHECKPOINT_AFTER_EACH_ACTION` e `EVIDENCE_MODE`.

O Workflow Engine deve interromper a execução ao alcançar o limite de candidaturas por run ou de falhas consecutivas. Esses limites não podem ser substituídos pelo modelo. `EVIDENCE_MODE=confirmation` exige confirmação visual antes de gravar `enviada`.

## 7. API HTTP local

Prefixo: `/api/v1`.

```text
GET  /health
GET  /installation
GET  /state/preflight
GET  /state/checkpoint
POST /onboarding/validate
POST /preflight/run
GET  /campaign
PUT  /campaign
GET  /queue
POST /queue/items
POST /queue/:id/claim
POST /runs
GET  /runs/:id
POST /runs/:id/interrupt
POST /runs/:id/resume
GET  /runs/:id/events        # Server-Sent Events
GET  /approvals
POST /approvals/:id/decision
GET  /applications
POST /applications/:id/events
POST /exports/shareable
POST /imports/legacy-controls
POST /sync/reconcile
GET  /platforms
```

Toda resposta de mutação deve conter `request_id`, `event_ids` e estado atual. Erros devem conter:

```json
{
  "code": "approval_required",
  "message": "A confirmação do usuário é necessária antes do envio.",
  "retryable": false,
  "actionRequired": "approve"
}
```

O endpoint `POST /sync/reconcile` deve comparar os hashes e estados dos arquivos com a projeção SQLite, registrar divergências e nunca sobrescrever o JSON automaticamente.

Implementação do App Harness: o runtime local expõe onboarding, busca/adição/claim de fila, aderência, questionários, evidências, importação legada, acompanhamento, aprovações detalhadas, runs com thread/turn do App Server, SSE em `/api/v1/runs/:id/events?stream=1`, métricas e operações persistidas em `/api/v1/operations`. O servidor de produção é iniciado apenas em loopback, exige cookie de sessão e CSRF, aplica CSP e serializa mutações com lock e backup/hash do alvo.

Saídas brutas de processos são somente transitórias. O harness persiste apenas `result_json` e `safe_output` depois da sanitização; se não for possível remover um segredo com segurança, descarta a saída e registra apenas código e categoria do erro.

## 8. Ferramentas expostas ao agente

As ferramentas são de domínio de candidaturas e não dão shell genérico ao modelo:

```text
installation.read()
preflight.read()
campaign.read()
queue.search(filters)
queue.add(job)
queue.claim(item_id)
profile.read(fields)
resume.select(job_description)
browser.snapshot(session)
application.prepare(item_id)
approval.request(kind, payload)
application.record_confirmation(payload)
application.record_event(payload)
failure.record(payload)
checkpoint.save(payload)
panel.refresh()
```

`queue.claim` deve reproduzir a semântica de `proxima-acao.ps1 -Claim`: selecionar apenas item `na fila` em plataforma elegível, ordenar por prioridade, aderência, prazo e data de inclusão, alterar para `em andamento` e salvar checkpoint.

`approval.request` somente cria uma pendência. A decisão é uma ação da UI/API do usuário. `application.record_confirmation` só aceita confirmação produzida pelo Browser Adapter ou evidência revisada.

O agente não recebe uma ferramenta que aceite livremente `status=enviada`. O status enviado só pode ser produzido pelo caminho de confirmação visual definido na seção 10.

## 9. Eventos

Eventos mínimos:

```text
installation.checked
preflight.completed
campaign.updated
queue.item_added
queue.item_claimed
browser.snapshot_captured
application.prepared
approval.requested
approval.approved
approval.rejected
application.submission_confirmed
application.event_recorded
checkpoint.saved
run.paused
run.resumed
run.blocked
run.completed
failure.recorded
```

O frontend pode reconstruir a linha do tempo por eventos, mas o estado atual deve ser lido da projeção transacional.

## 10. Fluxo de envio

1. `queue.claim` reserva a vaga.
2. O agente abre a plataforma pela sessão Playwright.
3. O Browser Adapter captura snapshot e identifica etapa.
4. O agente preenche somente dados confirmados.
5. O sistema salva checkpoint antes do portão.
6. O backend cria aprovação com resumo e hash.
7. O usuário aprova ou rejeita na UI.
8. Se aprovado, o agente executa o envio.
9. O Browser Adapter verifica confirmação visual.
10. O backend grava candidatura e evidência; o Script Adapter atualiza JSON e relatórios com escrita atômica.
11. A vaga sai da fila e a execução continua ou termina por meta/bloqueio.

Se a tela atual divergir do checkpoint, o estado observado prevalece e a execução volta para revisão, nunca para clique automático.

### Falha entre arquivo e banco

1. Criar `operation` como `pending`.
2. Marcar como `running` e registrar o hash anterior do arquivo relevante.
3. Executar o script com argumentos validados.
4. Validar exit code, JSON retornado e hash/estrutura do arquivo.
5. Marcar `succeeded` e atualizar a projeção, ou `needs_reconcile` em caso de divergência.
6. Exibir a operação pendente e impedir nova mutação do mesmo agregado até reconciliação.

### Concorrência e retomada

- O backend deve adquirir um lock local por raiz do `Fluxo/` antes de qualquer mutação em JSON.
- Somente uma execução pode alterar uma vaga ou candidatura por vez.
- Um processo encerrado libera o lock pelo sistema operacional, mas a operação permanece em `needs_reconcile`.
- Ao iniciar, o app executa leitura de preflight, reconciliação e detecção de claims `em andamento` sem atualização recente.
- A retomada exige confirmação do usuário quando o checkpoint estiver desatualizado, a URL tiver mudado ou a tela não corresponder à etapa salva.

## 11. Segurança

- bind local por padrão;
- token de sessão local para evitar requisições arbitrárias;
- CSP e proteção contra CSRF na UI;
- allowlist de scripts e plataformas;
- argumentos sem interpolação de shell;
- sanitização de stdout/stderr;
- redaction de `password`, `token`, `cookie`, `mfa`, `authorization` e campos sensíveis;
- arquivos privados fora da exportação compartilhável;
- `.env` carregado por chave específica, nunca impresso integralmente;
- sem persistir storage state do navegador em artefato compartilhável;
- confirmação final habilitada por padrão;
- backup antes de substituir JSON ou Markdown privado.

## 12. Requisitos não funcionais

- **Desempenho:** carregar o estado inicial em até 2 segundos para até 5.000 candidaturas e 10.000 vagas na fila em máquina compatível; publicar um evento local em até 500 ms após recebê-lo.
- **Recuperação:** após encerramento inesperado, operações `running` devem voltar para `needs_reconcile` ou `failed`, nunca ser repetidas automaticamente.
- **Integridade:** toda escrita em JSON deve ser atômica, validada e precedida de backup quando o script atual já aplicar essa proteção.
- **Acessibilidade:** navegação por teclado, foco visível, labels associados, mensagens de erro textuais e contraste compatível com WCAG 2.1 AA.
- **Portabilidade:** funcionar no ambiente Windows documentado pelo pacote, usando Node.js 24+, PowerShell e `npx` disponíveis no preflight.
- **Privacidade:** nenhuma resposta de API, evento, métrica ou log deve conter senha, token, cookie, código MFA ou conteúdo privado além do estritamente necessário.
- **Operação offline:** leitura de painel, fila, candidaturas e checkpoint deve funcionar sem IA e sem internet; busca e navegador devem informar a indisponibilidade.

## 13. Registro de plataformas

O registry do app deve ser derivado de `config/plataformas.json` e dos valores locais do `.env`, sem duplicar credenciais. No MVP, as plataformas suportadas são `GUPY`, `INFOJOBS`, `PANDAPE`, `LINKEDIN`, `CATHO`, `VAGASCOM` e `SOLIDES`.

Para cada plataforma, o app deve exibir URL, habilitação, meta e modo de autenticação (`password`, `link-convite` ou `manual`). O playbook correspondente deve vir do campo `playbook`, e alterações no registry devem ser detectadas pelo preflight.

## 14. Compatibilidade e migração

### Fase 1

1. Ler arquivos atuais sem modificá-los.
2. Criar projeção SQLite e validar equivalência.
3. Exibir painel, fila e checkpoint.
4. Executar scripts existentes pelo Script Adapter.
5. Comparar exit code, JSON retornado e arquivo final antes de marcar uma mutação como concluída.

### Fase 2

1. Escrever eventos antes de atualizar relatórios.
2. Integrar aprovações e runs.
3. Integrar Browser Adapter e streaming.
4. Adicionar importação de controles legados.

### Fase 3

Migrar regras estáveis dos scripts para TypeScript, mantendo comandos PowerShell como fallback até todos os testes passarem.

Toda migração de autoridade deve ter exportação de backup, flag de compatibilidade, comparação de resultados e rollback para os arquivos anteriores.

## 15. Observabilidade

Cada execução deve conter `run_id`, `request_id`, `platform`, `queue_item_id`, duração, resultado, tentativa e motivo de parada. Logs devem ser úteis para diagnóstico, mas nunca armazenar segredo ou conteúdo sensível desnecessário.

O painel deve mostrar métricas operacionais: meta, enviadas confirmadas, pendências, falhas, bloqueios, testes e próxima ação.

## 16. Testes

### Unitários

- parser dos arquivos JSON;
- máquina de estados;
- deduplicação;
- seleção da próxima ação;
- validade e hash de aprovação;
- redaction de logs;
- escrita atômica e backup.
- mapeamento exato dos status de fila e candidatura.

### Integração

- preflight bloqueia campanha;
- retomada lê checkpoint;
- script adapter rejeita comando fora da allowlist;
- candidatura sem confirmação não é registrada como enviada;
- aprovação invalidada após alteração;
- falha repetida move item para bloqueado;
- exportação não inclui arquivos privados.
- divergência entre SQLite e JSON é detectada e reportada.

### E2E

Usar fixtures locais e uma plataforma simulada. Não executar testes automatizados contra contas reais ou enviar candidaturas reais.

## 17. Critério técnico de pronto

O MVP estará pronto quando uma instalação existente do `Fluxo/` puder ser aberta no app, exibir preflight/campanha/fila, retomar um checkpoint, conduzir uma execução simulada até um portão de aprovação, registrar um envio simulado com evidência, gerar painel e produzir exportação sanitizada sem alterar os arquivos privados incorretamente.
