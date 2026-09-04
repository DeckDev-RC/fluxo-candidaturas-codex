# App Harness — Estado local somente leitura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o primeiro incremento do App Harness do `Fluxo/`: uma interface web local somente leitura que apresenta instalação, preflight, campanha, fila, candidaturas e checkpoint sem abrir navegador ou executar mutações.

**Architecture:** Um servidor Node.js nativo servirá arquivos estáticos e uma API local. Um leitor de estado puro lerá somente arquivos JSON permitidos, normalizará o snapshot e removerá campos sensíveis antes da resposta. A interface consumirá `GET /api/v1/state` e exibirá o estado atual.

**Tech Stack:** Node.js 20+, JavaScript ESM, `node:test`, `node:assert`, `node:http`, `node:fs/promises`, HTML/CSS/JavaScript sem framework e sem dependências de produção no primeiro incremento.

**Spec:** `docs/PRD-APP-HARNESS.md` e `docs/SDD-APP-HARNESS.md`

## Global Constraints

- O escopo é exclusivamente o diretório `Fluxo/`.
- O primeiro incremento é local-first, single-user e somente leitura.
- Não abrir Playwright, não iniciar Codex App Server e não executar scripts PowerShell neste incremento.
- Não ler `.env`, currículo real, perfil privado, evidências ou mensagens privadas para montar a resposta da API.
- Os JSONs atuais permanecem como fonte operacional.
- O servidor deve escutar apenas em `127.0.0.1`.
- Toda função de produção deve ter teste escrito e observado falhar antes da implementação.
- A API nunca pode incluir senha, token, cookie, MFA, autorização ou conteúdo privado.

---

### Task 1: Leitor normalizado do estado do Fluxo

**Files:**
- Create: `app/package.json`
- Create: `app/test/state-reader.test.mjs`
- Create: `app/src/state-reader.mjs`

**Interfaces:**
- Consumes: uma raiz absoluta do `Fluxo/` e os arquivos JSON operacionais existentes.
- Produces: `readFluxoState(rootDir): Promise<FluxoState>`.
- Produces: `FluxoState` com `installation`, `preflight`, `campaign`, `queue`, `applications` e `checkpoint`.

`app/package.json` deve conter exatamente os scripts mínimos abaixo antes de executar os testes:

```json
{
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test" }
}
```

- [ ] **Step 1: Write the failing tests**

Criar um fixture temporário com `estado/preflight.json`, `campanha/config.json`, `fila/vagas.json`, `candidaturas/candidaturas.json` e `estado/checkpoint.json`. Testar que o leitor normaliza o snapshot, calcula contagens e não inclui dados de `.env`.

```js
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFluxoState } from '../src/state-reader.mjs';

test('readFluxoState returns normalized campaign and queue summary', async () => {
  const root = await createFixture({
    preflight: { ready: true, checks: [{ level: 'critical', status: 'ok' }] },
    campaign: {
      totalGoal: 2,
      dailyGoal: 1,
      weeklyGoal: 2,
      platforms: [{ name: 'GUPY', enabled: true, goal: 2 }]
    },
    queue: [
      { id: 'q1', key: 'GUPY:1', platform: 'GUPY', status: 'na fila', priority: 'A', fitScore: 90 },
      { id: 'q2', key: 'GUPY:2', platform: 'GUPY', status: 'em andamento', priority: 'B', fitScore: 70 }
    ],
    applications: [
      { id: 'a1', key: 'GUPY:3', platform: 'GUPY', status: 'enviada' }
    ],
    checkpoint: { phase: 'vaga selecionada', platform: 'GUPY', applicationKey: 'GUPY:2' }
  });

  const state = await readFluxoState(root);

  assert.equal(state.installation.ready, true);
  assert.equal(state.campaign.totalGoal, 2);
  assert.equal(state.queue.counts['na fila'], 1);
  assert.equal(state.queue.counts['em andamento'], 1);
  assert.equal(state.applications.confirmedCount, 1);
  assert.equal(state.checkpoint.applicationKey, 'GUPY:2');
});

test('readFluxoState omits secret files and secret-shaped fields', async () => {
  const root = await createFixture({
    preflight: { ready: true },
    campaign: { platforms: [] },
    queue: [],
    applications: [{ id: 'a1', status: 'rascunho', password: 'must-not-leak' }],
    checkpoint: { phase: 'aguardando usuário', notes: 'safe' },
    env: 'GUPY_PASSWORD=secret-value'
  });

  const state = await readFluxoState(root);
  const serialized = JSON.stringify(state);

  assert.equal(serialized.includes('secret-value'), false);
  assert.equal(serialized.includes('must-not-leak'), false);
  assert.equal('password' in state.applications.items[0], false);
});

test('readFluxoState returns empty safe defaults when optional runtime files are absent', async () => {
  const root = await createFixture({
    preflight: { ready: false },
    campaign: { platforms: [] },
    queue: [],
    applications: [],
    checkpoint: null,
    omitCheckpoint: true
  });

  const state = await readFluxoState(root);

  assert.deepEqual(state.queue.items, []);
  assert.deepEqual(state.applications.items, []);
  assert.equal(state.checkpoint, null);
});

async function createFixture({ preflight, campaign, queue, applications, checkpoint, env, omitCheckpoint = false }) {
  const root = await mkdtemp(join(tmpdir(), 'fluxo-harness-'));
  for (const directory of ['estado', 'campanha', 'fila', 'candidaturas']) {
    await mkdir(join(root, directory), { recursive: true });
  }
  await writeFile(join(root, 'estado', 'preflight.json'), JSON.stringify(preflight));
  await writeFile(join(root, 'campanha', 'config.json'), JSON.stringify(campaign));
  await writeFile(join(root, 'fila', 'vagas.json'), JSON.stringify(queue));
  await writeFile(join(root, 'candidaturas', 'candidaturas.json'), JSON.stringify(applications));
  if (!omitCheckpoint) await writeFile(join(root, 'estado', 'checkpoint.json'), JSON.stringify(checkpoint));
  if (env) await writeFile(join(root, '.env'), env);
  return root;
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-reporter=spec` from `Fluxo/app/`.

Expected: FAIL because `../src/state-reader.mjs` and `readFluxoState` ainda não existem.

- [ ] **Step 3: Write the minimal implementation**

Implementar `readFluxoState` com leitura exclusiva dos cinco JSONs, defaults seguros, contagem de fila, contagem de candidaturas nos status confirmados de `config/plataformas.json` e redaction recursiva de chaves sensíveis.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --test-reporter=spec` from `Fluxo/app/`.

Expected: 3 tests passing and 0 failures.

- [ ] **Step 5: Commit**

```powershell
git add app/package.json app/test/state-reader.test.mjs app/src/state-reader.mjs
git commit -m "feat: add normalized Fluxo state reader"
```

### Task 2: API local somente leitura

**Files:**
- Create: `app/test/http-server.test.mjs`
- Create: `app/src/http-server.mjs`
- Modify: `app/package.json`

**Interfaces:**
- Consumes: `readFluxoState(rootDir)` da Task 1.
- Produces: `createServer({ rootDir, port }): http.Server`.
- Produces: `GET /api/v1/state` com JSON normalizado.
- Produces: `GET /health` com `{ "ok": true }`.

- [ ] **Step 1: Write the failing test**

Testar a API em porta efêmera com fixture temporário. Confirmar status HTTP, `content-type`, dados normalizados, ausência de segredo e rejeição de método/caminho não suportado.

```js
const fixtureRoot = await createFixture({
  preflight: { ready: true },
  campaign: { platforms: [] },
  queue: [],
  applications: [],
  checkpoint: null
});

test('GET /api/v1/state exposes safe Fluxo state', async () => {
  const server = createServer({ rootDir: fixtureRoot });
  const address = await listen(server);
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/state`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.installation.ready, true);
  assert.equal(JSON.stringify(body).includes('PASSWORD'), false);
  server.close();
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}
```

- [ ] **Step 2: Run the API test to verify it fails**

Run: `npm test -- --test-reporter=spec` from `Fluxo/app/`.

Expected: FAIL because `http-server.mjs` ainda não exporta `createServer`.

- [ ] **Step 3: Write the minimal implementation**

Criar servidor Node HTTP que aceite somente `GET`, responda `/health` e `/api/v1/state`, use `readFluxoState`, devolva `404` para outros caminhos e faça bind padrão em `127.0.0.1`.

- [ ] **Step 4: Run the API tests to verify they pass**

Run: `npm test -- --test-reporter=spec` from `Fluxo/app/`.

Expected: todos os testes da Task 1 e Task 2 passando, sem warnings.

- [ ] **Step 5: Commit**

```powershell
git add app/package.json app/test/http-server.test.mjs app/src/http-server.mjs
git commit -m "feat: expose read-only Fluxo state API"
```

### Task 3: Interface web do dashboard

**Files:**
- Create: `app/public/index.html`
- Create: `app/public/app.js`
- Create: `app/public/styles.css`
- Create: `app/test/static-assets.test.mjs`
- Modify: `app/src/http-server.mjs`
- Modify: `app/package.json`

**Interfaces:**
- Consumes: `GET /api/v1/state`.
- Produces: dashboard local em `/` com resumo de instalação, campanha, fila, candidaturas e checkpoint.
- Produces: script `npm start` para servir o app em `127.0.0.1:4173`.

- [ ] **Step 1: Write the failing test**

Testar que `/` devolve HTML e que `app.js`/`styles.css` são servidos com content type correto. O teste deve também impedir que o HTML contenha valores de `.env`.

- [ ] **Step 2: Run the static asset tests to verify they fail**

Run: `npm test -- --test-reporter=spec` from `Fluxo/app/`.

Expected: FAIL porque os assets estáticos ainda não existem ou não são roteados.

- [ ] **Step 3: Write the minimal implementation**

Servir apenas arquivos existentes em `app/public`, bloquear path traversal, montar dashboard com estado carregado por `fetch` e mostrar estado vazio/bloqueado sem inventar dados.

- [ ] **Step 4: Run the full test suite to verify it passes**

Run: `npm test -- --test-reporter=spec` from `Fluxo/app/`.

Expected: todos os testes passando.

- [ ] **Step 5: Commit**

```powershell
git add app
git commit -m "feat: add local read-only Fluxo dashboard"
```

## Self-review checklist

- [ ] O app não lê `.env`.
- [ ] O app não executa PowerShell, Playwright ou App Server.
- [ ] O app não muda JSONs existentes.
- [ ] Os testes de cada comportamento foram vistos falhar antes do código correspondente.
- [ ] A API está limitada a `127.0.0.1`.
- [ ] A UI não promete candidatura enviada quando só existe `rascunho` ou `em andamento`.
- [ ] Os testes completos passam sem warnings antes de qualquer afirmação de conclusão.
