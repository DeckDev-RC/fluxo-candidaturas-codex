// Configurações: conta, plataformas, limites, preparação, privacidade e
// recuperação de dados. Nada aqui é o centro do app (U9-06).

import { badge, button, el, metric, panel, screen, staticListItem } from '../core/dom.mjs';
import { clearTranscript } from '../core/conversa.mjs';
import { resetConversation } from '../core/conversa-ia.mjs';
import { dataHora, duracao, numero } from '../core/format.mjs';
import { plural } from '../core/rotulos.mjs';
import { read, send } from '../core/api.mjs';
import { loadAiStatus, store } from '../core/store.mjs';
import { executarPreparacao } from '../core/actions.mjs';
import { notice } from '../ui/messages.mjs';
import { openDialog } from '../ui/dialog.mjs';
import { rerender } from '../core/router.mjs';
import { getTheme, setTheme, TEMAS } from '../core/tema.mjs';
import { codexPanel } from './partes/conta-codex.mjs';
import { skynetPanel } from './partes/conta-skynet.mjs';
import { plataformasPanel } from './partes/plataformas-config.mjs';

export function configuracoesScreen() {
  queueMicrotask(() => { atualizarDados(); });
  return screen({ title: 'Ajustes do Fluxo neste computador', children: [
    iaPanel(),
    providerPanel(),
    skynetPanel(),
    codexPanel(),
    plataformasPanel(),
    limitesPanel(),
    preparacaoPanel(),
    aparenciaPanel(),
    dadosPanel(),
    privacidadePanel()
  ] });
}

function iaPanel() {
  const ia = store.ia;
  const skynet = ia.provedor === 'skynet';
  const rotulo = ia.disponivel ? 'conectada' : 'indisponível';
  return panel({
    kicker: skynet ? 'conversa textual' : 'automação',
    title: 'Inteligência artificial',
    id: 'painel-ia',
    actions: [badge(rotulo, ia.disponivel ? 'sucesso' : 'atencao')],
    children: [
      el('p', { class: 'leitura secundario', text: ia.mensagem }),
      el('p', { class: 'apoio', text: `Modo em uso: ${rotuloModo(ia.modo)}. ${skynet ? 'Textos usam Skynet; operações usam Codex quando conectado.' : 'Textos e operações usam ChatGPT/Codex.'}` }),
      el('div', { class: 'linha-acoes' }, [
        button('Verificar novamente', { variant: 'secundario', onClick: async () => { await loadAiStatus(); rerender(); } })
      ])
    ]
  });
}

function providerPanel() {
  const active = store.ia.provedor;
  const options = [
    { id: 'skynet', label: 'SkynetChat', help: 'Conversa textual pelo Skynet; operações encaminhadas ao Codex.' },
    { id: 'codex', label: 'ChatGPT/Codex', help: 'Toda a conversa e as operações ficam no Codex.' }
  ];
  return panel({
    kicker: 'preferência',
    title: 'Qual IA responde na conversa?',
    id: 'painel-provedor-ia',
    children: [
      el('p', { class: 'apoio', text: 'As duas contas podem permanecer conectadas. Trocar a IA não encerra nenhuma sessão.' }),
      el('div', { class: 'linha-acoes', role: 'radiogroup', 'aria-label': 'IA da conversa' }, options.map((option) => button(option.label, {
        variant: option.id === active ? 'primario' : 'secundario',
        role: 'radio',
        'aria-checked': String(option.id === active),
        title: option.help,
        onClick: async () => {
          if (option.id === store.ia.provedor) return;
          try {
            await send('/api/v1/ai/provider', { provider: option.id }, { method: 'PUT' });
            await loadAiStatus();
            notice(`${option.label} agora responde na conversa.`, 'sucesso');
            rerender();
          } catch (error) { notice(error.message, 'erro'); }
        }
      })))
    ]
  });
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
          // Só o que é crítico pede ação sua; o resto a IA resolve na conversa.
          detail: item.fix || item.action || (item.level === 'critical' ? 'Resolva e verifique novamente.' : 'A IA cuida disto durante a conversa.'),
          right: [badge(item.level === 'critical' ? 'bloqueia' : item.level === 'warning' ? 'atenção' : 'informação', item.level === 'critical' ? 'erro' : item.level === 'warning' ? 'atencao' : 'informacao')]
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

// Aparência: a pessoa escolhe; o app não muda de cor sozinho por causa do sistema
// a menos que ela peça para seguir o sistema.
function aparenciaPanel() {
  const atual = getTheme();
  return panel({
    kicker: 'aparência',
    title: 'Tema da janela',
    children: [
      el('p', { class: 'leitura secundario', text: 'Escolha como o Fluxo aparece neste computador. "Seguir o sistema" acompanha o modo claro/escuro do Windows, inclusive quando ele muda no meio do dia.' }),
      el('div', { class: 'linha-acoes', role: 'radiogroup', 'aria-label': 'Tema' }, TEMAS.map((tema) => button(tema.rotulo, {
        variant: tema.id === atual ? 'primario' : 'secundario',
        role: 'radio', 'aria-checked': String(tema.id === atual),
        onClick: () => { setTheme(tema.id); rerender(); }
      })))
    ]
  });
}

function privacidadePanel() {
  return panel({
    kicker: 'privacidade',
    title: 'O que fica neste computador',
    children: [
      el('p', { class: 'leitura secundario', text: 'Perfil, currículos, candidaturas, evidências e credenciais são armazenados nesta máquina. O Fluxo não mantém um serviço próprio de dados.' }),
      el('p', { class: 'leitura apoio', text: 'Senhas de plataforma nunca são pedidas nesta tela nem na conversa. Login, verificação em duas etapas e CAPTCHA acontecem na janela do navegador, com você.' }),
      el('p', { class: 'leitura apoio', text: 'Uma cópia da conversa fica neste computador. Mensagens, currículo e contexto necessários podem ser enviados diretamente à IA escolhida conforme o consentimento e os termos do provedor.' }),
      el('div', { class: 'linha-acoes' }, [
        button('Limpar conversa', { variant: 'secundario', onClick: async () => {
          try {
            if (!store.demo) await resetConversation();
            clearTranscript();
            notice('Conversa apagada deste computador.', 'informacao');
          } catch (error) {
            notice(`Não foi possível apagar toda a conversa: ${error.message}`, 'erro');
          }
        } }),
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
    `Nesta execução: ${plural(uso.submitted ?? 0, 'candidatura enviada', 'candidaturas enviadas')}`,
    `${plural(uso.consecutiveFailures ?? 0, 'falha seguida', 'falhas seguidas')}`,
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
    alvo.replaceChildren(el('p', { class: 'apoio', text: `Contagem da campanha conferida: ${plural(relatorio.confirmedOnce ?? 0, 'candidatura confirmada', 'candidaturas confirmadas')} com evidência e evento correspondentes.` }));
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
  return { 'codex-app-server': 'ChatGPT/Codex', 'skynet-hybrid': 'Skynet + operações Codex', 'skynet-chat-only': 'SkynetChat somente texto', 'offline-read': 'somente leitura local', demonstracao: 'demonstração local' }[modo] ?? 'não determinado';
}

