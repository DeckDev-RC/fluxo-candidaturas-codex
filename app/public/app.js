// Ponto de entrada: liga sessão, estado, rotas e o acompanhamento da jornada.
// A lógica de cada área vive no módulo da própria área (U9-03).

import { bootstrapSession, describeError } from './core/api.mjs';
import { isDemo, loadAiStatus, loadState, decisions, store, subscribe } from './core/store.mjs';
import { rerender, startRouter, go, currentRoute } from './core/router.mjs';
import { restoreJourney } from './core/stream.mjs';
import { atualizarObjetivo } from './core/actions.mjs';
import { el, field } from './core/dom.mjs';
import { notice } from './ui/messages.mjs';
import { openDialog } from './ui/dialog.mjs';
import { agoraScreen } from './screens/agora.mjs';
import { oportunidadesScreen } from './screens/oportunidades.mjs';
import { candidaturasScreen } from './screens/candidaturas.mjs';
import { perfilScreen } from './screens/perfil.mjs';
import { decisoesScreen } from './screens/decisoes.mjs';
import { configuracoesScreen } from './screens/configuracoes.mjs';
import { ajudaScreen } from './screens/ajuda.mjs';
import { primeiroUsoScreen } from './screens/primeiro-uso.mjs';

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

document.querySelector('#editar-objetivo').addEventListener('click', abrirMudancaDeObjetivo);

document.querySelector('#conversa').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const campo = document.querySelector('#conversa-texto');
  const texto = campo.value.trim();
  if (!texto) return;
  campo.value = '';
  await interpretar(texto);
});

subscribe(() => { pintarCabecalho(); agendarRepintura(); });

// Atualizações agrupadas: novidade que chega enquanto a pessoa digita ou decide
// não desloca foco nem descarta rascunho (U7-05, U8-05, U9-05).
let repintura = null;
function agendarRepintura() {
  clearTimeout(repintura);
  repintura = setTimeout(() => {
    const ativo = document.activeElement;
    if (ativo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ativo.tagName)) return;
    if (document.querySelector('#dialogo')?.open) return;
    rerender();
  }, 150);
}

async function start() {
  if (isDemo()) notice('Demonstração local: os dados desta tela são fictícios e nenhuma ação externa acontece.', 'informacao');
  try {
    if (!isDemo()) await bootstrapSession();
    await loadState();
  } catch (error) {
    notice(`Não foi possível ler os dados locais: ${describeError(error)}`, 'erro');
  }
  startRouter({ routes: rotas, onChange: pintarCabecalho });
  if (!isDemo()) {
    restoreJourney();
    loadAiStatus();
  }
  pintarCabecalho();
  if (currentRoute() === 'agora' && !store.perfil?.profile?.exists) go('agora');
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
    ? `Abrir ${pendentes.length} decisão pendente`
    : 'Nenhuma decisão pendente');
}

function objetivoAtivo() {
  const fato = store.estado?.memory?.facts?.targetRoles;
  const valor = fato?.value;
  if (Array.isArray(valor)) return valor.join(', ');
  return String(valor ?? '').trim();
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

function abrirMudancaDeObjetivo() {
  const entrada = el('textarea', { id: 'novo-objetivo', rows: 2, value: objetivoAtivo() });
  openDialog({
    title: 'Mudar objetivo profissional',
    body: [
      field({ label: 'Novo objetivo', control: entrada, help: 'Vale para as próximas buscas.' }),
      el('p', { class: 'leitura apoio', text: 'O trabalho já preparado continua como está. Candidaturas confirmadas não são alteradas.' })
    ],
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Salvar objetivo',
        variant: 'primario',
        onSelect: async () => {
          const texto = entrada.value.trim();
          if (!texto) { notice('Escreva o novo objetivo para salvar.', 'atencao'); return false; }
          try { await atualizarObjetivo(texto); pintarCabecalho(); rerender(); }
          catch (error) { notice(describeError(error), 'erro'); return false; }
          return true;
        }
      }
    ]
  });
}

// A conversa complementa a interface: preferências viram alteração revisável e
// resultados continuam encontráveis nas telas (U4-06).
async function interpretar(texto) {
  const normalizado = texto.toLocaleLowerCase();
  if (/(remoto|híbrido|hibrido|presencial)/.test(normalizado)) {
    const modalidade = /remoto/.test(normalizado) ? 'Remoto' : /presencial/.test(normalizado) ? 'Presencial' : 'Híbrido';
    openDialog({
      title: 'Confirmar mudança de preferência',
      body: [el('p', { class: 'leitura', text: `Entendi que você quer priorizar vagas ${modalidade.toLocaleLowerCase()}. Isto altera a preferência do seu perfil e vale para as próximas buscas.` })],
      actions: [
        { label: 'Não alterar' },
        {
          label: `Priorizar ${modalidade.toLocaleLowerCase()}`,
          variant: 'primario',
          onSelect: async () => {
            const { corrigirFato } = await import('./core/actions.mjs');
            try { await corrigirFato('workModes', modalidade); } catch (error) { notice(describeError(error), 'erro'); return false; }
            return true;
          }
        }
      ]
    });
    return;
  }
  if (/(decis|aprov)/.test(normalizado)) { go('decisoes'); notice('Abri a caixa de decisões.', 'informacao'); return; }
  if (/(vaga|oportunidad)/.test(normalizado)) { go('oportunidades'); notice('Abri a lista de oportunidades.', 'informacao'); return; }
  if (/(candidatur|processo|entrevista)/.test(normalizado)) { go('candidaturas'); notice('Abri suas candidaturas.', 'informacao'); return; }
  if (/(perfil|curr[íi]culo|dado)/.test(normalizado)) { go('perfil'); notice('Abri seu perfil.', 'informacao'); return; }
  if (/(objetivo|cargo|quero trabalhar)/.test(normalizado)) { abrirMudancaDeObjetivo(); return; }
  notice('Ainda não sei atender esse pedido pela conversa. As áreas na lateral cobrem objetivo, oportunidades, candidaturas, perfil e decisões.', 'informacao');
}

start();
