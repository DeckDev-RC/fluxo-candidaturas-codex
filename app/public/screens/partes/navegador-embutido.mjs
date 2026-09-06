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
  return el('section', { class: 'acompanhamento-secao navegador-embutido' }, [
    el('header', { class: 'acompanhamento-cabecalho' }, [
      el('h3', { text: 'Navegador' }),
      abaAtiva ? el('span', { class: 'apoio quebra abas-endereco', text: abaAtiva.title || abaAtiva.url || '' }) : null
    ]),
    faixa,
    area,
    ativa ? el('div', { class: 'linha-acoes' }, [button('Esconder aba', { variant: 'texto', onClick: async () => { await window.fluxoDesktop.abas.esconder(); } })]) : null
  ]);
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
    if (endereco && ativa) endereco.textContent = ativa.title || ativa.url || '';
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
    window.addEventListener('scroll', publicarArea, { capture: true, passive: true });
    document.addEventListener('visibilitychange', publicarArea);
    new MutationObserver(publicarArea).observe(document.body, { attributes: true, attributeFilter: ['open'], subtree: true });
    // Rede de segurança para deslocamentos que nenhum observador captura (fontes, repintura).
    setInterval(publicarArea, 400);
  }
  observador.disconnect();
  observador.observe(elemento);
  publicarArea();
}

function publicarArea() {
  if (!window.fluxoDesktop?.abas) return;
  let retangulo = null;
  const dialogoAberto = Boolean(document.querySelector('#dialogo')?.open);
  if (areaAtual?.isConnected && currentRoute() === 'agora' && !dialogoAberto && document.visibilityState !== 'hidden') {
    const caixa = areaAtual.getBoundingClientRect();
    const x = Math.max(caixa.left, 0);
    const y = Math.max(caixa.top, 0);
    const largura = Math.min(caixa.right, window.innerWidth) - x;
    const altura = Math.min(caixa.bottom, window.innerHeight) - y;
    if (largura > ALTURA_MINIMA && altura > ALTURA_MINIMA) retangulo = { x, y, width: largura, height: altura };
  }
  const chave = JSON.stringify(retangulo);
  if (chave === ultimoEnvio) return;
  ultimoEnvio = chave;
  window.fluxoDesktop.abas.area(retangulo).catch(() => { ultimoEnvio = ''; });
}