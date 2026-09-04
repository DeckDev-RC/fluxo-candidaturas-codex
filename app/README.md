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

O dashboard inicia em modo somente leitura. Preflight, claim, exportação, aprovação e execução de navegador são ações separadas e sujeitas às políticas do Fluxo.

## API local

- `GET /health`;
- `GET /api/v1/state`;
- `GET /api/v1/campaign`;
- `GET /api/v1/queue`;
- `GET /api/v1/applications`;
- `GET /api/v1/approvals`;
- `GET /api/v1/runs/:id/events`;
- `POST /api/v1/preflight/run`;
- `POST /api/v1/queue/items`;
- `POST /api/v1/queue/:id/claim`;
- `POST /api/v1/applications/prepare`;
- `POST /api/v1/exports/shareable`.

O servidor escuta somente em `127.0.0.1`. Testes usam fixtures e não acessam plataformas reais.
