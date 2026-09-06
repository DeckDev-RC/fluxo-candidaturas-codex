// Ponto de entrada: liga sessão, estado, rotas, conversa e o acompanhamento da
// jornada. A lógica de cada área vive no módulo da própria área (U9-03).

import { bootstrapSession, describeError } from './core/api.mjs';
import { isDemo, loadState, decisions, store, subscribe } from './core/store.mjs';
import { rerender, startRouter } from './core/router.mjs';
import { restoreJourney } from './core/stream.mjs';
import { onTranscript, startTranscript } from './core/conversa.mjs';
import { connectAiStatus, refreshAiOnFocus } from './core/ia-status.mjs';
import { agentDriving, connectConversation, disconnectConversation } from './core/conversa-ia.mjs';
import { detectEmbeddedBrowser } from './screens/partes/navegador-embutido.mjs';
import { startTheme } from './core/tema.mjs';
import { notice, renderNotices } from './ui/messages.mjs';
import { agoraScreen } from './screens/agora.mjs';
import { oportunidadesScreen } from './screens/oportunidades.mjs';
import { candidaturasScreen } from './screens/candidaturas.mjs';
import { perfilScreen } from './screens/perfil.mjs';
import { decisoesScreen } from './screens/decisoes.mjs';
import { configuracoesScreen } from './screens/configuracoes.mjs';
import { ajudaScreen } from './screens/ajuda.mjs';
import { primeiroUsoScreen } from './screens/primeiro-uso.mjs';
import { abrirMudancaDeObjetivo, objetivoAtivo } from './screens/partes/objetivo.mjs';
import { bindConversationInput } from './screens/partes/conversa-entrada.mjs';

const rotas = {
  agora: agoraScreen,
  oportunidades: oportunidadesScreen,
  candidaturas: candidaturasScreen,
  perfil: perfilScreen,
  decisoes: decisoesScreen,
  configuracoes: configuracoesScreen,
  ajuda: ajudaScreen,
  'primeiro-uso': primeiroUsoScreen
};

document.querySelector('#atualizar').addEventListener('click', async (evento) => {
  const botao = evento.currentTarget;
  botao.disabled = true;
  botao.setAttribute('aria-busy', 'true');
  try { await loadState(); rerender(); } finally { botao.disabled = false; botao.removeAttribute('aria-busy'); }
});

document.querySelector('#editar-objetivo').addEventListener('click', () => abrirMudancaDeObjetivo({ aoSalvar: pintarCabecalho }));
bindConversationInput(document.querySelector('#conversa'));
ligarRecolherNavegacao();
startTheme();

// A navegação lateral recolhe para só ícones (botão ou Ctrl+B) e a escolha
// fica guardada neste computador. Recolhida, cada item mostra o nome no título.
function ligarRecolherNavegacao() {
  const aplicacao = document.querySelector('.aplicacao');
  const botao = document.querySelector('#alternar-navegacao');
  const CHAVE = 'fluxo-navegacao';
  const aplicar = (recolhida) => {
    aplicacao.dataset.navegacao = recolhida ? 'recolhida' : 'aberta';
    botao.setAttribute('aria-expanded', String(!recolhida));
    botao.setAttribute('aria-label', recolhida ? 'Expandir menu' : 'Recolher menu');
    botao.title = `${recolhida ? 'Expandir' : 'Recolher'} menu (Ctrl+B)`;
    for (const link of document.querySelectorAll('.navegacao a')) link.title = recolhida ? link.getAttribute('aria-label') ?? '' : '';
    try { window.localStorage.setItem(CHAVE, recolhida ? 'recolhida' : 'aberta'); } catch {}
  };
  const alternar = () => aplicar(aplicacao.dataset.navegacao !== 'recolhida');
  botao.addEventListener('click', alternar);
  window.addEventListener('keydown', (evento) => {
    if ((evento.ctrlKey || evento.metaKey) && !evento.altKey && evento.key.toLowerCase() === 'b') { evento.preventDefault(); alternar(); }
  });
  let salva = 'aberta';
  try { salva = window.localStorage.getItem(CHAVE) ?? 'aberta'; } catch {}
  aplicar(salva === 'recolhida');
}

subscribe(() => { pintarCabecalho(); agendarRepintura(); ligarConversaDaIa(); });
onTranscript(agendarRepintura);

// Com a IA conectada, a conversa passa a receber o que o agente diz e faz.
function ligarConversaDaIa() {
  if (agentDriving()) connectConversation();
  else disconnectConversation();
}

// Atualizações agrupadas: novidade que chega enquanto a pessoa digita ou decide
// não desloca foco nem descarta rascunho (U7-05, U8-05, U9-05).
let repintura = null;
function agendarRepintura() {
  clearTimeout(repintura);
  repintura = setTimeout(() => {
    const ativo = document.activeElement;
    if (ativo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ativo.tagName) && ativo.id !== 'conversa-texto') return;
    // Um botão ocupado não pode ser trocado no meio da ação: a repintura espera.
    if (document.querySelector('#tela button[aria-busy="true"]')) { agendarRepintura(); return; }
    if (document.querySelector('#dialogo')?.open) return;
    rerender();
  }, 150);
}

async function start() {
  startTranscript();
  if (isDemo()) notice('Demonstração local: os dados desta tela são fictícios e nenhuma ação externa acontece.', 'informacao', { persistente: true });
  try {
    if (!isDemo()) await bootstrapSession();
    await loadState();
  } catch (error) {
    notice(`Não foi possível ler os dados locais: ${describeError(error)}`, 'erro');
  }
  // Desktop com navegador embutido: a coluna de acompanhamento vira o lugar das abas.
  if (!isDemo() && await detectEmbeddedBrowser()) document.querySelector('#conteudo').dataset.navegador = 'embutido';
  startRouter({ routes: rotas, onChange: aoTrocarRota });
  if (!isDemo()) {
    restoreJourney();
    connectAiStatus();
    refreshAiOnFocus();
  }
  pintarCabecalho();
}

// A área de trabalho sabe qual área mostra (data-area, distinto do data-rota
// dos links): a conversa ocupa a largura toda.
function aoTrocarRota(rota) {
  const area = document.querySelector('#conteudo');
  if (area) area.dataset.area = rota;
  renderNotices();
  pintarCabecalho();
}

function pintarCabecalho() {
  const objetivo = objetivoAtivo();
  document.querySelector('#objetivo-texto').textContent = objetivo || 'Ainda não definido';
  document.querySelector('#estado-trabalho').textContent = descreverTrabalho();
  const pendentes = decisions();
  const indicador = document.querySelector('#indicador-decisoes');
  indicador.dataset.vazio = pendentes.length ? 'false' : 'true';
  document.querySelector('#indicador-decisoes-texto').textContent = pendentes.length
    ? `${pendentes.length} ${pendentes.length === 1 ? 'decisão precisa' : 'decisões precisam'} de você`
    : 'Nenhuma decisão pendente';
  indicador.setAttribute('aria-label', pendentes.length
    ? `Abrir ${pendentes.length} ${pendentes.length === 1 ? 'decisão pendente' : 'decisões pendentes'}`
    : 'Nenhuma decisão pendente');
  // Sem decisão não é link: o destino só existe quando há o que decidir.
  if (pendentes.length) indicador.setAttribute('href', '#decisoes'); else indicador.removeAttribute('href');
}

function descreverTrabalho() {
  if (store.carregando) return 'Lendo os dados deste computador';
  if (store.erro) return `Leitura local com problema: ${store.erro}`;
  const jornada = store.jornada;
  const textos = {
    trabalhando: jornada.mensagem || 'Executando a próxima tarefa autorizada',
    decisao: 'Parado esperando uma decisão sua',
    pausada: 'Pausado por você',
    bloqueio: jornada.mensagem || 'Parado por uma falha',
    incerto: 'Um envio precisa de conferência',
    concluida: 'Jornada concluída com resultados confirmados',
    encerrada: 'Campanha encerrada'
  };
  if (textos[jornada.status]) return textos[jornada.status];
  const habilitadas = (store.estado?.campaign?.platforms ?? []).filter((item) => item.enabled !== false).length;
  return habilitadas ? `Pronto para procurar em ${habilitadas} plataforma(s) habilitada(s)` : 'Nenhuma plataforma habilitada ainda';
}

start();
