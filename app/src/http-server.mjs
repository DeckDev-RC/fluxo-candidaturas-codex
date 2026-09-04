import { createServer as createHttpServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readFluxoState } from './state-reader.mjs';
import { createQueueService } from './queue-service.mjs';
import { createRunService } from './run-service.mjs';
import { createApprovalService } from './approval-service.mjs';
import { createShareableExport } from './export-service.mjs';

const PUBLIC_DIR = new URL('../public/', import.meta.url);
const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/preflight-summary.js', ['preflight-summary.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']]
]);

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
};

export function createServer({ rootDir, queueService = createQueueService({ rootDir }), exportService = { createShareableExport: () => createShareableExport({ rootDir }) } }) {
  mkdirSync(join(rootDir, 'estado'), { recursive: true });
  const runService = createRunService({ dbPath: join(rootDir, 'estado', 'harness.sqlite') });
  const approvalService = createApprovalService({ dbPath: join(rootDir, 'estado', 'harness.sqlite') });
  const server = createHttpServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;

    if (request.method === 'GET' && path === '/health') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'GET' && path === '/api/v1/state') {
      try {
        const state = await readFluxoState(rootDir);
        sendJson(response, 200, state);
      } catch {
        sendJson(response, 500, {
          error: { code: 'state_read_failed', message: 'Não foi possível ler o estado local do Fluxo.' }
        });
      }
      return;
    }

    if (request.method === 'GET' && path === '/api/v1/queue') {
      try {
        sendJson(response, 200, await queueService.listQueue());
      } catch {
        sendJson(response, 500, { error: { code: 'queue_read_failed', message: 'Não foi possível ler a fila local.' } });
      }
      return;
    }

    const runMatch = path.match(/^\/api\/v1\/runs\/([^/]+)$/);
    if (request.method === 'GET' && runMatch) {
      const run = runService.getRun(decodeURIComponent(runMatch[1]));
      if (!run) {
        sendJson(response, 404, { error: { code: 'run_not_found', message: 'Execução não encontrada.' } });
      } else {
        sendJson(response, 200, run);
      }
      return;
    }

    if (request.method === 'POST' && path === '/api/v1/runs') {
      try {
        const input = await readJsonBody(request);
        sendJson(response, 201, runService.startRun(input));
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    if (request.method === 'GET' && path === '/api/v1/approvals') {
      sendJson(response, 200, approvalService.listApprovals());
      return;
    }

    if (request.method === 'POST' && path === '/api/v1/exports/shareable') {
      try {
        sendJson(response, 200, await exportService.createShareableExport());
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    if (request.method === 'POST' && path === '/api/v1/approvals') {
      try {
        sendJson(response, 201, approvalService.requestApproval(await readJsonBody(request)));
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    const approvalMatch = path.match(/^\/api\/v1\/approvals\/([^/]+)\/decision$/);
    if (request.method === 'POST' && approvalMatch) {
      try {
        const input = await readJsonBody(request);
        sendJson(response, 200, approvalService.decideApproval(decodeURIComponent(approvalMatch[1]), input));
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    const runActionMatch = path.match(/^\/api\/v1\/runs\/([^/]+)\/(interrupt|resume)$/);
    if (request.method === 'POST' && runActionMatch) {
      try {
        const id = decodeURIComponent(runActionMatch[1]);
        const run = runActionMatch[2] === 'interrupt'
          ? runService.pauseRun(id, 'interrompido pelo usuário')
          : runService.resumeRun(id);
        sendJson(response, 200, run);
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    if (request.method === 'POST' && path === '/api/v1/queue/items') {
      try {
        const item = await queueService.addQueueItem(await readJsonBody(request));
        sendJson(response, 201, item);
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    const claimMatch = path.match(/^\/api\/v1\/queue\/([^/]+)\/claim$/);
    if (request.method === 'POST' && claimMatch) {
      try {
        const item = await queueService.claimNext({ id: decodeURIComponent(claimMatch[1]) });
        sendJson(response, 200, item);
      } catch (error) {
        sendDomainError(response, error);
      }
      return;
    }

    if (STATIC_FILES.has(path) && request.method !== 'GET') {
      sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Método não permitido.' } });
      return;
    }

    const knownPath = path === '/health' || path === '/api/v1/state' || path === '/api/v1/queue'
      || path === '/api/v1/queue/items' || path === '/api/v1/runs' || path === '/api/v1/approvals' || path === '/api/v1/exports/shareable' || Boolean(claimMatch) || Boolean(runMatch) || Boolean(runActionMatch) || Boolean(approvalMatch);
    if (knownPath) {
      sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Método não permitido.' } });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'POST') {
      sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Método não permitido.' } });
      return;
    }

    const staticFile = STATIC_FILES.get(path);
    if (request.method === 'GET' && staticFile) {
      try {
        const body = await readFile(new URL(staticFile[0], PUBLIC_DIR));
        response.writeHead(200, {
          'content-type': staticFile[1],
          'cache-control': 'no-store'
        });
        response.end(body);
      } catch {
        sendJson(response, 500, {
          error: { code: 'asset_read_failed', message: 'Não foi possível carregar a interface local.' }
        });
      }
      return;
    }

    sendJson(response, 404, { error: { code: 'not_found', message: 'Recurso não encontrado.' } });
  });
  server.once('close', () => {
    approvalService.close();
    runService.close();
  });
  return server;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, JSON_HEADERS);
  response.end(JSON.stringify(payload));
}

function sendDomainError(response, error) {
  const statusCode = error?.code === 'queue_item_not_found' || error?.code === 'run_not_found' || error?.code === 'approval_not_found' ? 404
    : error?.code?.startsWith('queue_') || error?.code?.startsWith('approval_') || error?.code === 'run_not_resumable' ? 409 : 400;
  sendJson(response, statusCode, {
    error: { code: error?.code ?? 'request_failed', message: error?.message ?? 'Não foi possível concluir a operação.' }
  });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) reject(Object.assign(new Error('Payload muito grande.'), { code: 'payload_too_large' }));
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error('JSON inválido.'), { code: 'invalid_json' }));
      }
    });
    request.on('error', reject);
  });
}
