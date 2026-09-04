import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readFluxoState } from './state-reader.mjs';

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

export function createServer({ rootDir }) {
  return createHttpServer(async (request, response) => {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Método não permitido.' } });
      return;
    }

    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;

    if (path === '/health') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (path === '/api/v1/state') {
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
