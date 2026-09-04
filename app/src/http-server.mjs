import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readFluxoState } from './state-reader.mjs';
import { createQueueService } from './queue-service.mjs';

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

export function createServer({ rootDir, queueService = createQueueService({ rootDir }) }) {
  return createHttpServer(async (request, response) => {
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

    const knownPath = path === '/health' || path === '/api/v1/state' || path === '/api/v1/queue'
      || path === '/api/v1/queue/items' || Boolean(claimMatch);
    if (knownPath) {
      sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Método não permitido.' } });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'POST') {
      sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Método não permitido.' } });
      return;
    }

    const staticFile = STATIC_FILES.get(path);
    if (staticFile) {
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
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, JSON_HEADERS);
  response.end(JSON.stringify(payload));
}

function sendDomainError(response, error) {
  const statusCode = error?.code === 'queue_item_not_found' ? 404 : error?.code?.startsWith('queue_') ? 409 : 400;
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
