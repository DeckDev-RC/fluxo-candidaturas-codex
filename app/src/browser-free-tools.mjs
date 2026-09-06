// Ferramentas de navegação livre para a IA (fluxo_browser_*). Mesmo formato das
// entradas de domain-tools: [nome, descrição, propriedades, handler]. Operam na
// aba de uma plataforma já habilitada; os portões vivem em browser-free.mjs
// (senha, desafio, ação sensível confirmada) e no adaptador (fronteira de confiança).

import { assertUrlPublica } from './browser-free.mjs';

export const FERRAMENTAS_LIVRES_DE_LEITURA = ['fluxo_browser_observe', 'fluxo_browser_read', 'fluxo_browser_scroll', 'fluxo_browser_back', 'fluxo_browser_navigate'];
export const FERRAMENTAS_LIVRES_DE_ACAO = ['fluxo_browser_click', 'fluxo_browser_type', 'fluxo_browser_select', 'fluxo_browser_press'];

export function browserFreeTools({ browserAdapter, string, opcional }) {
  const numero = { type: 'number' };
  const booleano = { type: 'boolean' };
  return [
    ['fluxo_browser_observe', 'Ver a página atual da aba da plataforma: título, cabeçalhos, trecho do texto e elementos interativos com ref (links, botões, campos, listas). Use antes de clicar/digitar e depois de cada mudança. query filtra elementos por texto; limit padrão 60.', { platform: string, query: opcional('string'), limit: opcional('number') }, (input) => browserAdapter.observe(input.platform, { query: input.query, limit: input.limit })],
    ['fluxo_browser_read', 'Ler o texto principal da página inteira (até 12 mil caracteres) para analisar perfil, mensagem, convite ou descrição longa.', { platform: string, maxChars: opcional('number') }, (input) => browserAdapter.readText(input.platform, { maxChars: input.maxChars })],
    ['fluxo_browser_click', 'Clicar no elemento ref. Ações com efeito fora do app (enviar, aceitar, conectar, seguir, excluir, publicar…) exigem confirmed=true, só depois de a pessoa dizer sim para essa ação específica.', { platform: string, ref: string, confirmed: opcional('boolean') }, (input) => browserAdapter.act(input.platform, { type: 'click', ref: input.ref, confirmed: input.confirmed === true })],
    ['fluxo_browser_type', 'Digitar no campo ref (substitui o conteúdo). submit=true pressiona Enter em seguida (busca). Nunca funciona em campo de senha ou código de verificação.', { platform: string, ref: string, text: string, submit: opcional('boolean') }, (input) => browserAdapter.act(input.platform, { type: 'type', ref: input.ref, text: input.text, submit: input.submit === true })],
    ['fluxo_browser_select', 'Escolher uma opção (rótulo ou valor) numa lista suspensa ref.', { platform: string, ref: string, value: string }, (input) => browserAdapter.act(input.platform, { type: 'select', ref: input.ref, value: input.value })],
    ['fluxo_browser_press', 'Pressionar uma tecla na página: Enter, Escape, Tab, setas, PageDown/PageUp, Home, End, Backspace, Space.', { platform: string, key: string }, (input) => browserAdapter.act(input.platform, { type: 'press', key: input.key })],
    ['fluxo_browser_scroll', 'Rolar a página (direction down|up) ou até o elemento ref.', { platform: string, direction: opcional('string'), ref: opcional('string') }, (input) => browserAdapter.act(input.platform, { type: 'scroll', direction: input.direction, ref: input.ref })],
    ['fluxo_browser_navigate', 'Ir para uma URL http(s) pública na aba da plataforma (perfil, mensagens, convites, página da empresa).', { platform: string, url: string }, (input) => { assertUrlPublica(input.url); return browserAdapter.act(input.platform, { type: 'navigate', url: input.url }); }],
    ['fluxo_browser_back', 'Voltar uma página na aba.', { platform: string }, (input) => browserAdapter.act(input.platform, { type: 'back' })]
  ].map(([name, description, properties, handler]) => [name, description, ajustar(properties, numero, booleano), handler]);
}

// `opcional('number')` e `opcional('boolean')` já produzem o schema certo; este
// passo só existe para manter o formato uniforme se o helper mudar.
function ajustar(properties) { return properties; }
