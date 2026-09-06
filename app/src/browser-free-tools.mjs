// Ferramentas de navegação livre para a IA (fluxo_browser_*), no modelo do
// Playwright MCP: snapshot com refs, ações por ref ou por papel e nome, espera,
// captura de tela. Mesmo formato das entradas de domain-tools:
// [nome, descrição, propriedades, handler]. Os portões vivem em browser-free.mjs
// (senha, desafio, ação sensível confirmada) e no adaptador (fronteira de confiança).

import { assertUrlPublica } from './browser-free.mjs';

export const FERRAMENTAS_LIVRES_DE_LEITURA = ['fluxo_browser_observe', 'fluxo_browser_read', 'fluxo_browser_scroll', 'fluxo_browser_back', 'fluxo_browser_navigate', 'fluxo_browser_wait', 'fluxo_browser_screenshot', 'fluxo_browser_hover'];
export const FERRAMENTAS_LIVRES_DE_ACAO = ['fluxo_browser_click', 'fluxo_browser_type', 'fluxo_browser_select', 'fluxo_browser_press'];

export function browserFreeTools({ browserAdapter, string, opcional }) {
  const alvo = { ref: opcional('string'), role: opcional('string'), name: opcional('string') };
  const agir = (type, extra = (input) => ({})) => (input) => browserAdapter.act(input.platform, { type, ref: input.ref, role: input.role, name: input.name, ...extra(input) });
  return [
    ['fluxo_browser_observe', 'Snapshot de acessibilidade da aba da plataforma: árvore de elementos com papel, nome e ref ([ref=e12]), como o Playwright entrega. Sempre observe antes de agir e use as refs do ÚLTIMO snapshot (elas expiram quando a página muda). query filtra as linhas que contêm um texto (com os ancestrais); maxChars amplia o limite (padrão 12000).', { platform: string, query: opcional('string'), maxChars: opcional('number') }, (input) => browserAdapter.observe(input.platform, { query: input.query, maxChars: input.maxChars })],
    ['fluxo_browser_read', 'Texto principal da página inteira (até 12 mil caracteres): perfil, mensagem, convite, descrição longa.', { platform: string, maxChars: opcional('number') }, (input) => browserAdapter.readText(input.platform, { maxChars: input.maxChars })],
    ['fluxo_browser_click', 'Clicar num elemento: por ref do último snapshot ou por role+name (ex.: role=button, name=Mensagem). Ações com efeito fora do app (enviar, aceitar, conectar, seguir, excluir, publicar…) exigem confirmed=true, só depois de a pessoa dizer sim para essa ação específica. Devolve o snapshot novo.', { platform: string, ...alvo, confirmed: opcional('boolean') }, agir('click', (input) => ({ confirmed: input.confirmed === true }))],
    ['fluxo_browser_type', 'Digitar num campo (input, textarea ou editor contenteditable), por ref ou role+name; substitui o conteúdo. submit=true pressiona Enter depois; slowly=true digita tecla a tecla (campos com autocompletar). Nunca funciona em senha ou código de verificação.', { platform: string, ...alvo, text: string, submit: opcional('boolean'), slowly: opcional('boolean') }, agir('type', (input) => ({ text: input.text, submit: input.submit === true, slowly: input.slowly === true }))],
    ['fluxo_browser_select', 'Escolher uma opção (rótulo ou valor) numa lista suspensa, por ref ou role+name.', { platform: string, ...alvo, value: string }, agir('select', (input) => ({ value: input.value }))],
    ['fluxo_browser_hover', 'Passar o mouse sobre um elemento (abre menus e dicas), por ref ou role+name.', { platform: string, ...alvo }, agir('hover')],
    ['fluxo_browser_press', 'Pressionar uma tecla: letras, números, Enter, Escape, Tab, setas, PageUp/PageDown, Home, End, Backspace, Delete, Space, ou combinação com Control/Shift (ex.: Control+a, Shift+Enter).', { platform: string, key: string }, agir('press', (input) => ({ key: input.key }))],
    ['fluxo_browser_scroll', 'Rolar a página (direction down|up) ou até um elemento (ref ou role+name).', { platform: string, direction: opcional('string'), ...alvo }, agir('scroll', (input) => ({ direction: input.direction }))],
    ['fluxo_browser_wait', 'Esperar a página: text (até aparecer, 15s), textGone (até sumir) ou seconds (até 10). Use após clicar em algo que abre um painel, envia ou carrega. Devolve o snapshot novo.', { platform: string, text: opcional('string'), textGone: opcional('string'), seconds: opcional('number') }, agir('wait', (input) => ({ text: input.text, textGone: input.textGone, seconds: input.seconds }))],
    ['fluxo_browser_screenshot', 'Ver a tela (imagem da área visível, ou de um elemento por ref/role+name). Use só quando o snapshot não explica o que está acontecendo ou a pessoa pediu algo visual; a imagem vai para você e não é gravada.', { platform: string, ...alvo }, agir('screenshot')],
    ['fluxo_browser_navigate', 'Ir para uma URL http(s) pública na aba da plataforma (perfil, mensagens, convites, página da empresa). Devolve o snapshot novo.', { platform: string, url: string }, (input) => { assertUrlPublica(input.url); return browserAdapter.act(input.platform, { type: 'navigate', url: input.url }); }],
    ['fluxo_browser_back', 'Voltar uma página na aba.', { platform: string }, agir('back')]
  ];
}
