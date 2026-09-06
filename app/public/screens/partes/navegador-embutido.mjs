// Navegador embutido: as abas das plataformas vivem na janela do app, sobre a
// área reservada nesta seção. A interface só diz onde a área está e qual aba
// mostrar; quem desenha a página é o processo principal (WebContentsView) e
// quem navega é a IA, pelo mesmo driver. Sem desktop ou sem CDP, a seção não
// existe e o acompanhamento mostra a lista simples.

import { badge, button, el } from '../../core/dom.mjs';
import { send, describeError } from '../../core/api.mjs';
import { nomePlataforma } from '../../core/conversa-ia.mjs';
import { notify, store } from '../../core/store.mjs';
import { currentRoute } from '../../core/router.mjs';
import { notice } from '../../ui/messages.mjs';

const ALTURA_MINIMA = 40;
let embutido = null;
let abasDaJanela = [];
let ouvindo = false;

export function isEmbeddedBrowser() { return embutido === true; }
// Desktop sem a porta de depuração: o navegador abre em janela separada e a
// interface diz isso, em vez de a pessoa procurar a aba dentro do app.
export function isDesktopWithoutEmbedded() { return embutido === false && Boolean(window.fluxoDesktop?.abas); }

// Pergunta ao desktop uma vez se o Chromium do app aceita o driver (CDP).
export async function detectEmbeddedBrowser() {
  if (embutido !== null) return embutido;
  if (!window.fluxoDesktop?.abas) { embutido = false; return false; }
  try { embutido = Boolean((await window.fluxoDesktop.workspace()).embutido); } catch { embutido = false; }
  if (embutido) ouvirJanela();
  return embutido;
}

export function embeddedBrowserSection() {
  const habilitadas = (store.estado?.campaign?.platforms ?? []).filter((item) => item.enabled !== false).map((item) => String(item.name).toUpperCase());
  const plataformas = [...new Set([...habilitadas, ...abasDaJanela.map((aba) => aba.platform)])];
  const ativa = abasDaJanela.find((aba) => aba.visible)?.platform ?? '';
  const faixa = el('div', { class: 'abas-faixa', role: 'tablist', 'aria-label': 'Plataformas abertas na janela' }, plataformas.map((plataforma) => {
    const aberta = abasDaJanela.some((aba) => aba.platform === plataforma);
    const situacao = store.conversa?.abas?.find((aba) => String(aba.platform).toUpperCase() === plataforma);
    return button(nomePlataforma(plataforma), {
      variant: 'aba', role: 'tab', 'aria-selected': String(plataforma === ativa),
      dataset: { aberta: String(aberta), situacao: situacao?.challenge ? 'desafio' : situacao?.loginPending ? 'login' : aberta ? 'conectada' : 'fechada' },
      title: situacao?.challenge ? 'Verificação pendente' : situacao?.loginPending ? 'Login pendente' : aberta ? 'Aberta' : 'Abrir nesta área',
      onClick: () => selecionar(plataforma)
    });
  }));
  const abaAtiva = abasDaJanela.find((aba) => aba.platform === ativa);
  const area = el('div', { class: 'abas-area', id: 'navegador-area', role: 'tabpanel', 'aria-label': ativa ? `Aba ${nomePlataforma(ativa)}` : 'Área do navegador' }, [
    ativa ? null : el('p', { class: 'apoio', text: plataformas.length ? 'Escolha uma plataforma para vê-la aqui. A IA abre e navega nesta área; quando pedir login, você entra aqui mesmo.' : 'Habilite plataformas em "Ajustar plataformas e metas" para vê-las aqui.' })
  ]);
  acompanharArea(area);
  const miniatura = publicarZoom() < 1;
  return el('section', { class: 'acompanhamento-secao navegador-embutido', dataset: { ampliado: String(ampliado), miniatura: String(miniatura) } }, [
    el('header', { class: 'acompanhamento-cabecalho' }, [
      el('h3', { text: 'Navegador' }),
      miniatura ? el('span', { class: 'apoio', text: 'miniatura', title: 'O site é mostrado no layout de computador, reduzido. Amplie para interagir; quando a IA pedir login, o tamanho real volta sozinho.' }) : null,
      button(ampliado ? 'Reduzir' : 'Ampliar', { variant: 'texto', 'aria-pressed': String(ampliado), onClick: alternarAmpliacao })
    ]),
    faixa,
    abaAtiva ? controlesDaAba(abaAtiva) : null,
    area,
    ativa ? el('div', { class: 'linha-acoes' }, [button('Esconder aba', { variant: 'texto', onClick: async () => { await window.fluxoDesktop.abas.esconder(); } })]) : null
  ]);
}

// Controles manuais da aba visível. A IA continua navegando pelo driver; isto é
// para a pessoa se situar e desatar uma página presa.
function controlesDaAba(aba) {
  const abas = window.fluxoDesktop.abas;
  return el('div', { class: 'abas-controles' }, [
    button('‹', { class: 'botao botao-secundario botao-icone', 'aria-label': 'Voltar na aba', title: 'Voltar', onClick: () => abas.voltar(aba.platform) }),
    button('↻', { class: 'botao botao-secundario botao-icone', 'aria-label': 'Recarregar a aba', title: 'Recarregar', onClick: () => abas.recarregar(aba.platform) }),
    el('span', { class: 'abas-endereco', title: aba.url || '', text: enderecoLegivel(aba) }),
    button('Abrir fora', { variant: 'texto', title: 'Abrir esta página no navegador do sistema', onClick: () => abas.abrirExterna(aba.platform) })
  ]);
}

// "linkedin.com/jobs/search" em vez da URL inteira com parâmetros.
function enderecoLegivel(aba) {
  try {
    const url = new URL(aba.url);
    const caminho = url.pathname.replace(/\/$/, '');
    return `${url.hostname.replace(/^www\./, '')}${caminho}`;
  } catch { return aba.title || ''; }
}

// Miniatura: na coluna estreita o site é mostrado no layout de computador,
// reduzido (zoom 0,67), para acompanhar o que a IA faz. Volta ao tamanho real
// quando a pessoa amplia ou quando a IA está esperando por ela na aba (login,
// verificação, cookies): aí ela precisa ler e digitar.
const ZOOM_MINIATURA = 0.67;
const ESPERAS_NA_ABA = new Set(['login', 'challenge', 'consent']);
let zoomPublicado = 0;
function zoomDesejado() {
  if (ampliado) return 1;
  if (ESPERAS_NA_ABA.has(store.conversa?.aguardando?.kind)) return 1;
  return ZOOM_MINIATURA;
}
function publicarZoom() {
  const fator = zoomDesejado();
  if (fator !== zoomPublicado && window.fluxoDesktop?.abas?.zoom) {
    zoomPublicado = fator;
    window.fluxoDesktop.abas.zoom(fator).catch(() => { zoomPublicado = 0; });
  }
  return fator;
}

let ampliado = false;
function alternarAmpliacao() {
  ampliado = !ampliado;
  const atual = document.querySelector('.navegador-embutido');
  if (atual) atual.replaceWith(embeddedBrowserSection());
  requestAnimationFrame(publicarArea);
}

// Retorna um selo para a lista simples quando o embutido não existe.
export function seloDaAba(aba) {
  return aba.challenge ? badge('verificação pendente', 'atencao') : aba.loginPending ? badge('login pendente', 'atencao') : badge('conectado', 'sucesso');
}

async function selecionar(plataforma) {
  const aberta = abasDaJanela.some((aba) => aba.platform === plataforma);
  try {
    if (!aberta) {
      notice(`Abrindo ${nomePlataforma(plataforma)} na janela…`, 'informacao');
      await send('/api/v1/browser/open', { platform: plataforma });
    }
    await window.fluxoDesktop.abas.mostrar(plataforma);
  } catch (error) {
    notice(describeError(error), 'erro');
  }
}

function ouvirJanela() {
  if (ouvindo) return;
  ouvindo = true;
  window.fluxoDesktop.abas.aoMudar(receberAbas);
  window.fluxoDesktop.abas.listar().then(receberAbas).catch(() => {});
}

// A seção se atualiza no lugar: a repintura geral espera a pessoa terminar de
// digitar, mas a aba que acabou de abrir precisa aparecer na hora.
function receberAbas(lista) {
  const anterior = abasDaJanela;
  abasDaJanela = Array.isArray(lista) ? lista : [];
  const atual = document.querySelector('.navegador-embutido');
  // Mudou só título ou carregamento: ajusta o texto e não recria a seção (recriar
  // move a área e faz a aba piscar). Mudou a lista ou a aba visível: redesenha.
  const mesmaEstrutura = anterior.length === abasDaJanela.length && anterior.every((aba, i) => aba.platform === abasDaJanela[i].platform && aba.visible === abasDaJanela[i].visible);
  if (atual && mesmaEstrutura) {
    const endereco = atual.querySelector('.abas-endereco');
    const ativa = abasDaJanela.find((aba) => aba.visible);
    if (endereco && ativa) { endereco.textContent = enderecoLegivel(ativa); endereco.title = ativa.url || ''; }
    return;
  }
  if (atual) atual.replaceWith(embeddedBrowserSection());
  else notify();
}

// Onde a aba deve aparecer: o retângulo visível da área, em coordenadas da
// janela. Some da vista, muda de rota ou abre diálogo → null (aba escondida).
let areaAtual = null;
let ultimoEnvio = '';
let observador = null;
function acompanharArea(elemento) {
  areaAtual = elemento;
  if (!observador) {
    observador = new ResizeObserver(() => publicarArea());
    window.addEventListener('resize', publicarArea);
    // Rolagem dispara dezenas de vezes por segundo: uma medição por quadro basta.
    let quadro = 0;
    window.addEventListener('scroll', () => { if (quadro) return; quadro = requestAnimationFrame(() => { quadro = 0; publicarArea(); }); }, { capture: true, passive: true });
    document.addEventListener('visibilitychange', publicarArea);
    new MutationObserver(publicarArea).observe(document.body, { attributes: true, attributeFilter: ['open'], subtree: true });
    // Rede de segurança para deslocamentos que nenhum observador captura (fontes, repintura).
    setInterval(publicarArea, 400);
  }
  observador.disconnect();
  observador.observe(elemento);
  // A seção ainda não está na página neste momento (a repintura a anexa depois):
  // medir agora daria "fora da vista" e a aba piscaria a cada repintura.
  requestAnimationFrame(publicarArea);
}

let falhasDeIpc = 0;
let proximaTentativaEm = 0;
function publicarArea() {
  if (!window.fluxoDesktop?.abas) return;
  // Sem seção montada não há o que informar; IPC negado (troca de pasta) espera com folga.
  if (!areaAtual?.isConnected && ultimoEnvio === 'null') return;
  if (Date.now() < proximaTentativaEm) return;
  // Uma repintura trocou a seção: adota o elemento novo em vez de esconder a aba.
  if (areaAtual && !areaAtual.isConnected) {
    const nova = document.querySelector('#navegador-area');
    if (nova) { areaAtual = nova; observador?.observe(nova); }
  }
  let retangulo = null;
  const dialogoAberto = Boolean(document.querySelector('#dialogo')?.open);
  if (areaAtual?.isConnected && currentRoute() === 'agora' && !dialogoAberto && document.visibilityState !== 'hidden') {
    const caixa = areaAtual.getBoundingClientRect();
    // Recorte pela área de trabalho (que rola sob o cabeçalho), não só pela janela:
    // a aba nunca cobre o cabeçalho nem a barra de escrita.
    const limite = areaAtual.closest('.area')?.getBoundingClientRect() ?? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    const x = Math.max(caixa.left, limite.left, 0);
    const y = Math.max(caixa.top, limite.top, 0);
    const largura = Math.min(caixa.right, limite.right, window.innerWidth) - x;
    const altura = Math.min(caixa.bottom, limite.bottom, window.innerHeight) - y;
    if (largura > ALTURA_MINIMA && altura > ALTURA_MINIMA) retangulo = { x, y, width: largura, height: altura };
  }
  // O tamanho da janela em CSS muda com o zoom da página: entra na chave para o
  // processo principal reposicionar mesmo quando o retângulo CSS não mudou.
  const chave = JSON.stringify([retangulo, window.innerWidth, window.innerHeight]);
  if (chave === ultimoEnvio) return;
  ultimoEnvio = chave;
  window.fluxoDesktop.abas.area(retangulo)
    .then(() => { falhasDeIpc = 0; })
    .catch(() => { ultimoEnvio = ''; falhasDeIpc += 1; proximaTentativaEm = Date.now() + Math.min(30_000, 1_000 * 2 ** Math.min(falhasDeIpc, 5)); });
}