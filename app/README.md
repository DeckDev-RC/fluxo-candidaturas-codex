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

Abra `http://127.0.0.1:4173`.

O contrato completo de instalação, modos (`chatgpt`, `api-key`, fixture e offline),
diagnóstico e limites está em [`docs/CONTRATO-DE-EXECUCAO.md`](../docs/CONTRATO-DE-EXECUCAO.md).

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
