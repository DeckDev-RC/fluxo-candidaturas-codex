import { readJsonBody, respond, sendJson } from './http-helpers.mjs';
import { platformHome } from '../platform-search.mjs';

// Navegador das plataformas: a página marcadora que identifica a aba embutida
// para o driver, a lista de abas e o pedido da pessoa para abrir uma plataforma
// pela interface (a mesma ferramenta que a IA usa).
const MARCADORA = /^\/aba\/([A-Za-z0-9_-]{1,32})$/;
const CAMINHOS = new Set(['/api/v1/browser/tabs', '/api/v1/browser/open']);

export function createBrowserRoutes({ browserAdapter = null, browserHost = null, platformUrls = () => ({}) } = {}) {
  return {
    knows: (path) => CAMINHOS.has(path) || MARCADORA.test(path),
    async handle(request, response, { path }) {
      const marcadora = path.match(MARCADORA);
      if (marcadora) {
        if (request.method !== 'GET') { sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Método não permitido.' } }); return true; }
        response.setHeader('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'");
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        response.end(paginaMarcadora(marcadora[1].toUpperCase()));
        return true;
      }
      if (!CAMINHOS.has(path)) return false;
      if (!browserAdapter) { sendJson(response, 503, { error: { code: 'browser_unavailable', message: 'O navegador das plataformas não está disponível nesta instalação.' } }); return true; }
      if (request.method === 'GET' && path === '/api/v1/browser/tabs') {
        return respond(response, 200, async () => ({ embedded: Boolean(browserHost), tabs: await browserAdapter.tabs() }));
      }
      if (request.method === 'POST' && path === '/api/v1/browser/open') {
        return respond(response, 200, async () => {
          const corpo = await readJsonBody(request);
          const platform = String(corpo.platform ?? '').toUpperCase();
          const url = platformHome(platform, platformUrls());
          if (!url) throw Object.assign(new Error('Plataforma sem página de entrada conhecida.'), { code: 'invalid_platform' });
          return browserAdapter.openPlatform(platform, url);
        });
      }
      sendJson(response, 405, { error: { code: 'method_not_allowed', message: 'Método não permitido.' } });
      return true;
    }
  };
}

// Página neutra que a aba mostra por um instante antes da plataforma carregar.
function paginaMarcadora(platform) {
  const nome = platform.replace(/[^A-Z0-9_-]/g, '');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Fluxo · ${nome}</title>`
    + '<style>html,body{margin:0;height:100%;font-family:system-ui,sans-serif;background:#fafafa;color:#52525b}body{display:grid;place-items:center}p{font-size:14px}</style></head>'
    + `<body><p>Abrindo ${nome}…</p></body></html>`;
}
