# App Harness local

Interface web local para operar o pacote `Fluxo/`.

## Requisitos

- Node.js 24+;
- PowerShell e `npx` disponíveis para preflight/scripts;
- sessão Playwright configurada somente quando uma execução de navegador for autorizada.

## Executar

Na pasta `app/`:

```powershell
npm test
npm start
```

## Autoridade SQLite

Uma raiz existente continua usando JSON até uma migração deliberada. Faça backup
normal do diretório e então execute:

```powershell
npm run migrate:persistence -- --root ..
```

A migração cria uma cópia dos três JSONs operacionais em
`estado/migration-backups/`, mantém IDs, campos extras, datas, histórico e
evidências, e torna `estado/fluxo.sqlite` a autoridade. Depois disso, JSON não
é importado na inicialização: use a ação explícita de exportação/reconciliação
da persistência para resolver qualquer divergência detectada.

Abra `http://127.0.0.1:4173`.

O contrato completo de instalação, modos (`chatgpt`, `api-key`, fixture e offline),
diagnóstico e limites está em [`docs/CONTRATO-DE-EXECUCAO.md`](../docs/CONTRATO-DE-EXECUCAO.md).

## Login com ChatGPT (OAuth)

O Autopilot usa o login do ChatGPT/Codex local por OAuth; não é necessário configurar `OPENAI_API_KEY`. O status do CLI pode ser consultado com:

```powershell
codex login status
```

Na interface, clique em **Entrar com ChatGPT** para iniciar o OAuth do próprio `codex app-server`; o endereço devolvido pelo servidor é aberto no navegador. Em ambiente sem navegador local, o endpoint aceita `{ "device": true }` e devolve código/endereço de dispositivo. O status do `codex login` é apenas diagnóstico: a sessão do app-server é autenticada pelo método `account/login/start`.

O transporte remove `OPENAI_API_KEY`, `CODEX_API_KEY` e `CODEX_ACCESS_TOKEN` do ambiente do agente quando `AUTH_MODE=chatgpt` (padrão). Para uma execução deliberadamente baseada em API key, configure `AUTH_MODE=api-key` no `.env` local.

Em `AUTH_MODE=chatgpt`, o processo do app-server também usa `estado/codex-home`, um diretório privado do Fluxo, separado do `CODEX_HOME` usado pelo Codex instalado. Por isso, o login deve ser concluído pelo botão **Entrar com ChatGPT** deste app; a sessão do CLI não é reutilizada nem sobrescrita.

Referências: [Codex SDK/app-server](https://learn.chatgpt.com/docs/codex-sdk), [OAuth no OpenClaw](https://github.com/openclaw/openclaw/blob/main/docs/concepts/oauth.md) e [integração OpenAI do OpenClaw](https://github.com/openclaw/openclaw/blob/main/docs/providers/openai.md).

Na vista **Operações**, o bloco **Codex Harness** mostra a conta/plano, tokens acumulados, percentual das janelas de uso e horários de reset, além do catálogo de modelos e efforts suportados. A configuração salva (`estado/codex-settings.json`) é aplicada automaticamente aos próximos turns do Autopilot.

O dashboard inicia em modo somente leitura. O onboarding, preflight, claim, exportação, aprovação e execução de navegador são ações separadas e sujeitas às políticas do Fluxo. O runtime exige sessão local com cookie e CSRF, aceita somente conexões loopback, aplica CSP, atribui `x-request-id` e mantém mutações serializadas por `estado/harness.lock`.

## API local

- `GET /health`;
- `GET /api/v1/state`;
- `GET /api/v1/campaign`;
- `GET /api/v1/queue`;
- `GET /api/v1/queue/search`;
- `GET /api/v1/applications`;
- `GET /api/v1/approvals`;
- `GET /api/v1/operations`;
- `GET /api/v1/auth/session`, `GET /api/v1/observability`, `GET /api/v1/metrics`;
- `GET /api/v1/codex`, `POST /api/v1/codex/refresh`, `GET/PUT /api/v1/codex/settings`;
- `GET /api/v1/pending`, `GET /api/v1/assessments`;
- `GET /api/v1/runs/:id/events`;
- `POST /api/v1/onboarding`;
- `POST /api/v1/resumes/extract`, `POST /api/v1/resumes/select`, `POST /api/v1/jobs/fit`;
- `POST /api/v1/evidence`, `POST /api/v1/assessments`, `POST /api/v1/assessments/prepare`;
- `POST /api/v1/imports/legacy`;
- `POST /api/v1/state/checkpoint`, `DELETE /api/v1/state/checkpoint`;
- `POST /api/v1/runs/:id/agent-thread`, `POST /api/v1/runs/:id/agent-turn`;
- `POST /api/v1/preflight/run`;
- `POST /api/v1/queue/items`;
- `POST /api/v1/queue/:id/claim`;
- `POST /api/v1/applications/prepare`;
- `POST /api/v1/exports/shareable`.

Rotas mutáveis retornam envelope compatível com o SDD (`request_id`, `event_ids`, `state` e `data`). O endpoint de eventos aceita `?stream=1` para SSE; o App Server usa transporte JSONL local e nunca recebe shell genérico.

O servidor escuta somente em `127.0.0.1`. Testes usam fixtures e não acessam plataformas reais.
