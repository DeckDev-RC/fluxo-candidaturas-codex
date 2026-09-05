// Configurações: conta, plataformas, limites, preparação, privacidade e
// recuperação de dados. Nada aqui é o centro do app (U9-06).

import { badge, button, el, metric, panel, screen, staticListItem } from '../core/dom.mjs';
import { clearTranscript } from '../core/conversa.mjs';
import { dataHora, duracao, numero } from '../core/format.mjs';
import { read, send } from '../core/api.mjs';
import { loadAiStatus, store } from '../core/store.mjs';
import { executarPreparacao } from '../core/actions.mjs';
import { notice } from '../ui/messages.mjs';
import { openDialog } from '../ui/dialog.mjs';
import { rerender } from '../core/router.mjs';
import { codexPanel } from './partes/conta-codex.mjs';
import { plataformasPanel } from './partes/plataformas-config.mjs';

export function configuracoesScreen() {
  queueMicrotask(() => { atualizarDados(); });
  return screen({ title: 'Ajustes do Fluxo neste computador', children: [
    iaPanel(),
    codexPanel(),
    plataformasPanel(),
    limitesPanel(),
    preparacaoPanel(),
    dadosPanel(),
    privacidadePanel()
  ] });
}

function iaPanel() {
  const ia = store.ia;
  const semCodex = ia.motivo === 'codex_not_found';
  const rotulo = ia.disponivel ? 'conectada' : semCodex ? 'Codex não encontrado' : 'indisponível';
  return panel({
    kicker: 'automação',
    title: 'Automação de IA',
    id: 'painel-ia',
    actions: [badge(rotulo, ia.disponivel ? 'sucesso' : 'atencao')],
    children: [
      el('p', { class: 'leitura secundario', text: ia.mensagem }),
      el('p', { class: 'apoio', text: `Modo em uso: ${rotuloModo(ia.modo)}. Sem automação, você continua podendo revisar dados, decidir e registrar informações.` }),
      el('div', { class: 'linha-acoes' }, [
        // Sem o executável, o login não tem como começar: oferecer o botão só produziria erro.
        ...(semCodex || ia.disponivel ? [] : [botaoEntrarChatGPT()]),
        button('Verificar novamente', { variant: 'secundario', onClick: async () => { await loadAiStatus(); rerender(); } })
      ])
    ]
  });
}

function botaoEntrarChatGPT() {
  const botao = button('Entrar com ChatGPT', {
    id: 'entrar-chatgpt',
    onClick: async () => {
      // Feedback imediato: o login pode levar segundos e um segundo clique confunde.
      botao.disabled = true;
      botao.textContent = 'Abrindo o login…';
      try {
        const resultado = await send('/api/v1/auth/openai/login', {});
        if (resultado.authUrl) window.open(resultado.authUrl, '_blank', 'noopener');
        notice(resultado.userCode
          ? `Conclua o login no navegador usando o código ${resultado.userCode}. Nunca cole senha ou código aqui na conversa.`
          : 'Conclua o login do ChatGPT no navegador. Se ele oferecer abrir o aplicativo ChatGPT, cancele e volte para o Fluxo: eu aviso aqui quando a conexão for confirmada.', 'informacao');
      } catch (error) {
        notice(error.message, 'erro');
      } finally {
        botao.disabled = false;
        botao.textContent = 'Entrar com ChatGPT';
      }
    }
  });
  return botao;
}


function limitesPanel() {
  const limites = store.politica?.limits ?? {};
  const politica = store.politica?.policy ?? {};
  queueMicrotask(() => { atualizarConsumo(); });
  return panel({
    kicker: 'limites',
    title: 'Até onde o Fluxo vai sozinho',
    id: 'painel-limites',
    children: [
      el('p', { class: 'apoio', id: 'consumo-campanha', text: 'Lendo o consumo desta execução…' }),
      el('div', { class: 'blocos' }, [
        metric('Candidaturas por execução', limite(limites.maxApplicationsPerRun)),
        metric('Falhas seguidas antes de parar', limite(limites.maxConsecutiveFailures)),
        metric('Tentativas por tarefa', limite(limites.maxTaskAttempts)),
        metric('Duração máxima', duracao(limites.maxRunDurationMs ?? 0)),
        metric('Consumo máximo', `${numero(limites.maxRunTokens ?? 0)} tokens`),
        metric('Intervalo mínimo de acompanhamento', duracao(limites.followUpMinIntervalMs ?? 0))
      ]),
      el('p', { class: 'leitura apoio', text: politica.requireFinalConfirmation === false
        ? 'Você autorizou envio automático. Decisões legais, salariais e sensíveis continuam pedindo confirmação.'
        : 'Cada envio pede sua confirmação. Autorizar uma campanha não dispensa decisões legais, salariais ou sensíveis.' })
    ]
  });
}

function preparacaoPanel() {
  const preflight = store.estado?.preflight ?? { checks: [] };
  const pendencias = (preflight.checks ?? []).filter((item) => item.status && item.status !== 'ok');
  return panel({
    kicker: 'preparação',
    title: 'Este computador está pronto?',
    id: 'painel-preparacao',
    actions: [badge(store.estado?.installation?.ready ? 'pronto' : 'atenção necessária', store.estado?.installation?.ready ? 'sucesso' : 'atencao')],
    children: [
      pendencias.length
        ? el('ul', { class: 'lista' }, pendencias.map((item) => staticListItem({
          title: item.item ?? item.name ?? 'Dependência',
          support: item.detail ?? item.message ?? 'sem detalhe',
          detail: item.action ?? 'Resolva e verifique novamente.',
          right: [badge(item.status ?? 'pendente', 'atencao')]
        })))
        : el('p', { class: 'apoio', text: 'Nenhuma pendência registrada na última verificação.' }),
      el('div', { class: 'linha-acoes' }, [
        button('Verificar agora', {
          id: 'verificar-ambiente',
          onClick: async () => { await executarPreparacao(); notice('Verificação concluída.', 'sucesso'); rerender(); }
        })
      ])
    ]
  });
}

function dadosPanel() {
  return panel({
    kicker: 'dados e recuperação',
    title: 'Cópias, migração e exportação',
    id: 'painel-dados',
    children: [
      el('p', { class: 'leitura apoio', text: 'A migração guarda uma cópia dos arquivos originais antes de mudar qualquer coisa. Depois dela, o banco local mantém campanha, oportunidades e histórico.' }),
      el('p', { class: 'apoio', id: 'estado-dados', text: 'Carregando diagnóstico dos dados…' }),
      el('div', { id: 'consistencia' }),
      el('div', { class: 'linha-acoes' }, [
        button('Atualizar diagnóstico', { variant: 'secundario', onClick: () => atualizarDados({ force: true }) }),
        button('Migrar com cópia de segurança', { onClick: () => operacaoDados('migrate', 'Migração concluída com cópia de segurança.') }),
        button('Exportar cópias legíveis', { variant: 'secundario', onClick: () => operacaoDados('export', 'Cópias exportadas para a pasta de saída.') }),
        button('Exportar pacote para suporte', { variant: 'secundario', onClick: () => exportarPacote() }),
        button('Resolver divergência', { variant: 'perigo', onClick: () => confirmarReconciliacao() })
      ])
    ]
  });
}

function privacidadePanel() {
  return panel({
    kicker: 'privacidade',
    title: 'O que fica neste computador',
    children: [
      el('p', { class: 'leitura secundario', text: 'Perfil, currículos, candidaturas, evidências e credenciais ficam apenas nesta máquina. O Fluxo não envia seus dados para um serviço próprio.' }),
      el('p', { class: 'leitura apoio', text: 'Senhas de plataforma nunca são pedidas nesta tela nem na conversa. Login, verificação em duas etapas e CAPTCHA acontecem na janela do navegador, com você.' }),
      el('p', { class: 'leitura apoio', text: 'A conversa com o Fluxo também fica guardada só neste computador, para você reler o que aconteceu. Você pode apagá-la quando quiser; os dados do perfil e das candidaturas não mudam.' }),
      el('div', { class: 'linha-acoes' }, [
        button('Limpar conversa', { variant: 'secundario', onClick: () => { clearTranscript(); notice('Conversa apagada deste computador.', 'informacao'); } }),
        store.atualizadoEm ? el('span', { class: 'apoio', text: `Última leitura local: ${dataHora(store.atualizadoEm)}` }) : null
      ])
    ]
  });
}

// Consumo medido de verdade: candidaturas enviadas, falhas seguidas e tokens
// informados pela IA. Quando ela não informa, isso é dito.
// Diagnósticos são lidos uma vez por visita (ou ao pedir atualização), não a
// cada repintura: cada leitura abre o banco local.
const VALIDADE_MS = 30_000;
const cache = new Map();

async function lerComCache(caminho, { force = false } = {}) {
  const guardado = cache.get(caminho);
  if (!force && guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.valor;
  const valor = await read(caminho, { fallback: null });
  cache.set(caminho, { valor, em: Date.now() });
  return valor;
}

async function atualizarConsumo() {
  const alvo = document.querySelector('#consumo-campanha');
  if (!alvo) return;
  const dados = await lerComCache('/api/v1/campaign/limits');
  const uso = dados?.usage;
  if (!uso || uso.measured === false) {
    alvo.textContent = uso?.reason ?? 'Nenhuma execução ativa nesta sessão, então não há consumo a mostrar.';
    return;
  }
  const tokens = Number(uso.tokens ?? 0);
  alvo.textContent = [
    `Nesta execução: ${numero(uso.submitted ?? 0)} candidatura(s) enviada(s)`,
    `${numero(uso.consecutiveFailures ?? 0)} falha(s) seguida(s)`,
    tokens > 0 ? `${numero(tokens)} tokens medidos` : 'consumo de tokens ainda não informado pela IA',
    uso.cancelled ? 'campanha cancelada' : uso.pausedForUser ? 'aguardando você' : 'em andamento'
  ].join(' · ');
}

async function atualizarDados({ force = false } = {}) {
  const alvo = document.querySelector('#estado-dados');
  const dados = await lerComCache('/api/v1/persistence', { force });
  if (!alvo) return;
  if (!dados) { alvo.textContent = 'Não foi possível ler o diagnóstico dos dados agora.'; return; }
  const autoridade = dados.mode === 'sqlite' ? 'banco local' : 'arquivos legíveis';
  const divergencias = Array.isArray(dados.divergences) ? dados.divergences.length : 0;
  alvo.textContent = `Autoridade atual: ${autoridade}. Divergência detectada: ${divergencias ? `sim (${divergencias}), precisa de decisão` : 'não'}.`;
  await atualizarConsistencia({ force });
}

// Fecha a conta entre vaga processada, candidatura, evidência, eventos e metas.
async function atualizarConsistencia({ force = false } = {}) {
  const alvo = document.querySelector('#consistencia');
  if (!alvo) return;
  const relatorio = await lerComCache('/api/v1/consistency', { force });
  if (!relatorio) { alvo.replaceChildren(); return; }
  if (relatorio.available === false) { alvo.replaceChildren(el('p', { class: 'apoio', text: 'A conferência de consistência não está disponível nesta instalação.' })); return; }
  if (relatorio.consistent) {
    alvo.replaceChildren(el('p', { class: 'apoio', text: `Contagem da campanha conferida: ${numero(relatorio.confirmedOnce ?? 0)} candidatura(s) confirmada(s) com evidência e evento correspondentes.` }));
    return;
  }
  alvo.replaceChildren(el('div', { class: 'aviso', dataset: { tom: 'atencao' } }, [
    el('div', {}, [
      el('p', { text: 'A contagem da campanha não fecha com os registros:' }),
      el('ul', { class: 'marcadores' }, (relatorio.divergences ?? []).map((item) => el('li', { class: 'quebra', text: item }))),
      el('p', { class: 'apoio', text: 'Nenhuma candidatura é reenviada por causa disso. Confira a candidatura envolvida antes de qualquer nova ação.' })
    ])
  ]));
}

async function operacaoDados(operacao, mensagem) {
  try {
    await send(`/api/v1/persistence/${operacao}`, {});
    notice(mensagem, 'sucesso');
    await atualizarDados({ force: true });
  } catch (error) { notice(error.message, 'erro'); }
}

async function exportarPacote() {
  try {
    await send('/api/v1/exports/shareable', {});
    notice('Pacote criado na pasta de saída, sem senhas nem dados sensíveis.', 'sucesso');
  } catch (error) { notice(error.message, 'erro'); }
}

function confirmarReconciliacao() {
  openDialog({
    title: 'Resolver divergência entre banco e arquivos',
    body: [
      el('p', { class: 'leitura', text: 'Escolha qual fonte vale. A outra é sobrescrita. Uma cópia de segurança é criada antes.' }),
      el('p', { class: 'apoio', text: 'Faça isto apenas se o diagnóstico apontar divergência.' })
    ],
    actions: [
      { label: 'Cancelar' },
      { label: 'Manter o banco local', onSelect: () => operacaoReconciliacao('sqlite_wins') },
      { label: 'Importar dos arquivos', variant: 'perigo', onSelect: () => operacaoReconciliacao('import_legacy') }
    ]
  });
}

async function operacaoReconciliacao(strategy) {
  try {
    await send('/api/v1/persistence/reconcile', { strategy });
    notice('Divergência resolvida com a fonte escolhida.', 'sucesso');
    await atualizarDados({ force: true });
  } catch (error) { notice(error.message, 'erro'); }
}


// Os limites vêm da política do serviço; a interface não presume valores.
function limite(valor) {
  return valor === undefined || valor === null ? 'não informado' : numero(valor);
}

function rotuloModo(modo) {
  return { 'codex-app-server': 'automação completa', 'offline-read': 'somente leitura local', demonstracao: 'demonstração local' }[modo] ?? 'não determinado';
}

