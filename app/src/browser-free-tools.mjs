// Ferramentas de navegação livre para a IA, com os MESMOS nomes e parâmetros do
// Playwright MCP (browser_snapshot, browser_click(element, target), browser_type,
// browser_wait_for…): o modelo foi treinado nesse contrato e reconhece o ritmo
// snapshot → ref → ação → snapshot sem precisar aprender uma interface nossa.
// Extensões nossas ficam opcionais: `platform` (qual aba; sem ela, a aba em foco),
// `query` no snapshot, `role`+`name` como alternativa à ref, `confirmed` no clique.
// Mesmo formato das entradas de domain-tools: [nome, descrição, propriedades, handler].
// Os portões vivem em browser-free.mjs e no adaptador (fronteira de confiança).

import { assertUrlPublica } from './browser-free.mjs';

export const FERRAMENTAS_LIVRES_DE_LEITURA = ['browser_snapshot', 'browser_find', 'browser_read_text', 'browser_scroll', 'browser_navigate_back', 'browser_navigate', 'browser_wait_for', 'browser_take_screenshot', 'browser_hover', 'browser_console_messages', 'browser_network_requests'];
export const FERRAMENTAS_LIVRES_DE_ACAO = ['browser_click', 'browser_type', 'browser_select_option', 'browser_press_key'];

const DESCRICAO_ELEMENTO = 'Descrição legível do elemento (ex.: "botão Enviar mensagem"), usada na narração para a pessoa.';
const DESCRICAO_TARGET = 'Referência exata do elemento no último snapshot (ex.: e12 ou f4e5). Refs expiram quando a página muda; toda ação devolve um snapshot novo.';

export function browserFreeTools({ browserAdapter, string, opcional }) {
  const alvo = { element: opcional('string'), target: opcional('string'), ref: opcional('string'), role: opcional('string'), name: opcional('string') };
  const plataforma = opcional('string');
  // Sem `platform`, a ação vai para a aba em que a IA agiu por último.
  const aba = (input) => {
    const nome = String(input.platform ?? '').trim() || String(browserAdapter.activePlatform?.() ?? '');
    if (!nome) throw Object.assign(new Error('Nenhuma aba em foco: informe platform ou abra a plataforma primeiro (fluxo_open_platform).'), { code: 'platform_required' });
    return nome;
  };
  const agir = (type, extra = () => ({})) => (input) => browserAdapter.act(aba(input), { type, ref: input.target ?? input.ref, role: input.role, name: input.name, element: input.element, ...extra(input) });
  return [
    ['browser_snapshot', 'Snapshot de acessibilidade da página (melhor que screenshot): árvore em YAML com papel, nome e ref de cada elemento ([ref=e12]). Observe antes de agir e use as refs do ÚLTIMO snapshot. query mantém só as linhas com um texto (e os ancestrais); maxChars amplia o limite (padrão 12000).', { platform: plataforma, query: opcional('string'), maxChars: opcional('number') }, (input) => browserAdapter.observe(aba(input), { query: input.query, maxChars: input.maxChars })],
    ['browser_find', 'Procurar um texto no snapshot da página e receber só os nós que o contêm, com o caminho até eles e as refs. Mais barato que o snapshot inteiro quando você só precisa localizar um elemento e a ref dele.', { platform: plataforma, text: string, maxChars: opcional('number') }, (input) => browserAdapter.observe(aba(input), { query: input.text, maxChars: input.maxChars })],
    ['browser_read_text', 'Texto principal da página inteira (até 12 mil caracteres): perfil, mensagem, convite, descrição longa.', { platform: plataforma, maxChars: opcional('number') }, (input) => browserAdapter.readText(aba(input), { maxChars: input.maxChars })],
    ['browser_click', `Clicar num elemento da página. element: ${DESCRICAO_ELEMENTO} target: ${DESCRICAO_TARGET} Alternativa à ref: role+name (ex.: role=button, name=Mensagem). Ações com efeito fora do app (enviar, aceitar, conectar, seguir, excluir, publicar…) exigem confirmed=true, só depois de a pessoa dizer sim para essa ação específica. Devolve o snapshot novo, changed (a página mudou?) e, se algo falhou por baixo, diagnostics (erros de console e respostas 4xx/5xx). A mesma ação repetida sem a página mudar é barrada na terceira vez.`, { platform: plataforma, ...alvo, confirmed: opcional('boolean') }, agir('click', (input) => ({ confirmed: input.confirmed === true }))],
    ['browser_type', `Digitar texto num campo editável (input, textarea ou editor contenteditable); substitui o conteúdo. element: ${DESCRICAO_ELEMENTO} target: ${DESCRICAO_TARGET} submit=true pressiona Enter depois; slowly=true digita tecla a tecla (campos com autocompletar ou editores que só reagem a teclado). Nunca funciona em senha ou código de verificação.`, { platform: plataforma, ...alvo, text: string, submit: opcional('boolean'), slowly: opcional('boolean') }, agir('type', (input) => ({ text: input.text, submit: input.submit === true, slowly: input.slowly === true }))],
    ['browser_select_option', `Escolher uma opção numa lista suspensa. element: ${DESCRICAO_ELEMENTO} target: ${DESCRICAO_TARGET} values: rótulo ou valor da opção (lista com um item).`, { platform: plataforma, ...alvo, values: { type: 'array', items: { type: 'string' } } }, agir('select', (input) => ({ value: Array.isArray(input.values) ? String(input.values[0] ?? '') : String(input.values ?? '') }))],
    ['browser_hover', `Passar o mouse sobre um elemento (abre menus e dicas). element: ${DESCRICAO_ELEMENTO} target: ${DESCRICAO_TARGET}`, { platform: plataforma, ...alvo }, agir('hover')],
    ['browser_press_key', 'Pressionar uma tecla: letras, números, Enter, Escape, Tab, setas (ArrowDown…), PageUp/PageDown, Home, End, Backspace, Delete, Space, ou combinação com Control/Shift (ex.: Control+a, Shift+Enter).', { platform: plataforma, key: string }, agir('press', (input) => ({ key: input.key }))],
    ['browser_scroll', 'Rolar a página (direction down|up) ou até um elemento (target ou role+name).', { platform: plataforma, direction: opcional('string'), ...alvo }, agir('scroll', (input) => ({ direction: input.direction }))],
    ['browser_wait_for', 'Esperar a página: text (até o texto aparecer, 15s), textGone (até sumir) ou time (segundos, até 10). Use após clicar em algo que abre um painel, envia ou carrega. Devolve o snapshot novo. Não use time como primeira opção.', { platform: plataforma, text: opcional('string'), textGone: opcional('string'), time: opcional('number') }, agir('wait', (input) => ({ text: input.text, textGone: input.textGone, seconds: input.time }))],
    ['browser_take_screenshot', `Ver a tela como imagem (área visível, ou um elemento por target/role+name). Você não age a partir da imagem: use browser_snapshot para agir. Use só quando o snapshot não explica o que está acontecendo ou a pessoa pediu algo visual; a imagem vai para você e não é gravada. element: ${DESCRICAO_ELEMENTO}`, { platform: plataforma, ...alvo }, agir('screenshot')],
    ['browser_navigate', 'Ir para uma URL http(s) pública na aba da plataforma (perfil, mensagens, convites, página da empresa). Devolve o snapshot novo.', { platform: plataforma, url: string }, (input) => { assertUrlPublica(input.url); return browserAdapter.act(aba(input), { type: 'navigate', url: input.url }); }],
    ['browser_navigate_back', 'Voltar uma página na aba.', { platform: plataforma }, agir('back')],
    ['browser_console_messages', 'Erros de console da página desde que a aba foi aberta (só erros; sem avisos). Use quando uma ação não muda a tela e você quer a causa.', { platform: plataforma }, (input) => browserAdapter.diagnostics(aba(input), 'console')],
    ['browser_network_requests', 'Requisições que falharam ou responderam 4xx/5xx (fetch, XHR e documento; sem query string nem corpo). Use quando um envio ou login não surte efeito.', { platform: plataforma }, (input) => browserAdapter.diagnostics(aba(input), 'network')]
  ];
}
