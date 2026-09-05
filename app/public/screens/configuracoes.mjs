// Configurações: conta, plataformas, limites, preparação, privacidade e
// recuperação de dados. Nada aqui é o centro do app (U9-06).

import { badge, button, el, field, panel } from '../core/dom.mjs';
import { dataHora, duracao, numero } from '../core/format.mjs';
import { read, send } from '../core/api.mjs';
import { loadAiStatus, store } from '../core/store.mjs';
import { executarPreparacao, salvarPlataformas } from '../core/actions.mjs';
import { watchAiLogin } from '../core/ia-status.mjs';
import { notice } from '../ui/messages.mjs';
import { openDialog } from '../ui/dialog.mjs';
import { rerender } from '../core/router.mjs';

export function configuracoesScreen() {
  queueMicrotask(() => { atualizarDados(); });
  return el('div', { class: 'area', style: 'padding:0' }, [
    el('div', { class: 'area-titulo' }, [
      el('p', { class: 'etiqueta', text: 'configurações' }),
      el('h1', { text: 'Ajustes do Fluxo neste computador' })
    ]),
    iaPanel(),
    plataformasPanel(),
    limitesPanel(),
    preparacaoPanel(),
    dadosPanel(),
    privacidadePanel()
  ]);
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
        watchAiLogin();
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

function plataformasPanel() {
  const campanha = store.estado?.campaign ?? { platforms: [] };
  const registro = store.plataformas ?? [];
  const escolhas = new Map();

  return panel({
    kicker: 'onde procurar',
    title: 'Plataformas e metas',
    id: 'painel-plataformas',
    children: [
      el('p', { class: 'leitura apoio', text: 'A meta é contada por plataforma e só conta candidatura confirmada. Nenhuma plataforma desta versão está certificada para envio automático.' }),
      el('ul', { class: 'lista' }, registro.map((plataforma) => {
        const atual = (campanha.platforms ?? []).find((item) => item.name === plataforma.name) ?? { enabled: false, goal: 0 };
        const habilitada = el('input', { type: 'checkbox', checked: atual.enabled === true, id: `plataforma-${plataforma.name}` });
        const meta = el('input', { type: 'number', min: '0', step: '1', value: String(atual.goal ?? 0), id: `meta-${plataforma.name}` });
        escolhas.set(plataforma.name, { habilitada, meta });
        return el('li', {}, [
          el('div', { class: 'item-lista', role: 'none', style: 'cursor:default' }, [
            el('div', {}, [
              el('p', { class: 'item-titulo', text: plataforma.name }),
              el('p', { class: 'apoio', text: `Acesso: ${rotuloAuth(plataforma.auth)}` })
            ]),
            el('div', { class: 'item-direita' }, [
              el('label', { class: 'escolha' }, [habilitada, el('span', { text: 'usar nesta campanha' })]),
              el('label', { class: 'escolha' }, [el('span', { text: 'meta' }), meta])
            ])
          ])
        ]);
      })),
      el('div', { class: 'linha-acoes' }, [
        button('Salvar plataformas e metas', {
          id: 'salvar-plataformas',
          onClick: async () => {
            const plataformas = [...escolhas].map(([nome, campos]) => ({ name: nome, enabled: campos.habilitada.checked, goal: Number(campos.meta.value) || 0 }));
            try {
              const mudou = await salvarPlataformas(plataformas);
              if (!mudou) notice('Nada mudou nas plataformas e metas.', 'informacao');
              rerender();
            } catch (error) { notice(error.message, 'erro'); }
          }
        })
      ])
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
        bloco('Candidaturas por execução', numero(limites.maxApplicationsPerRun ?? 30)),
        bloco('Falhas seguidas antes de parar', numero(limites.maxConsecutiveFailures ?? 3)),
        bloco('Tentativas por tarefa', numero(limites.maxTaskAttempts ?? 2)),
        bloco('Duração máxima', duracao(limites.maxRunDurationMs ?? 0)),
        bloco('Consumo máximo', `${numero(limites.maxRunTokens ?? 0)} tokens`),
        bloco('Intervalo mínimo de acompanhamento', duracao(limites.followUpMinIntervalMs ?? 0))
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
        ? el('ul', { class: 'lista' }, pendencias.map((item) => el('li', {}, [
          el('div', { class: 'item-lista', role: 'none', style: 'cursor:default' }, [
            el('div', {}, [
              el('p', { class: 'item-titulo quebra', text: item.item ?? item.name ?? 'Dependência' }),
              el('p', { class: 'item-apoio quebra', text: item.detail ?? item.message ?? 'sem detalhe' }),
              el('p', { class: 'apoio', text: item.action ?? 'Resolva e verifique novamente.' })
            ]),
            el('div', { class: 'item-direita' }, [badge(item.status ?? 'pendente', 'atencao')])
          ])
        ])))
        : el('p', { class: 'apoio', text: 'Nenhuma pendência registrada na última verificação.' }),
      el('div', { class: 'linha-acoes' }, [
        button('Verificar agora', {
          id: 'verificar-ambiente',
          onClick: async () => {
            try { await executarPreparacao(); notice('Verificação concluída.', 'sucesso'); rerender(); }
            catch (error) { notice(error.message, 'erro'); }
          }
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
        button('Atualizar diagnóstico', { variant: 'secundario', onClick: () => atualizarDados() }),
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
      el('p', { class: 'apoio', text: store.atualizadoEm ? `Última leitura local: ${dataHora(store.atualizadoEm)}` : '' })
    ]
  });
}

// Consumo medido de verdade: candidaturas enviadas, falhas seguidas e tokens
// informados pelo runtime de IA. Quando o runtime não informa, isso é dito.
async function atualizarConsumo() {
  const alvo = document.querySelector('#consumo-campanha');
  if (!alvo) return;
  const dados = await read('/api/v1/campaign/limits', { fallback: null });
  const uso = dados?.usage;
  if (!uso || uso.measured === false) {
    alvo.textContent = uso?.reason ?? 'Nenhuma execução ativa nesta sessão, então não há consumo a mostrar.';
    return;
  }
  const tokens = Number(uso.tokens ?? 0);
  alvo.textContent = [
    `Nesta execução: ${numero(uso.submitted ?? 0)} candidatura(s) enviada(s)`,
    `${numero(uso.consecutiveFailures ?? 0)} falha(s) seguida(s)`,
    tokens > 0 ? `${numero(tokens)} tokens medidos` : 'consumo de tokens ainda não informado pelo runtime',
    uso.cancelled ? 'campanha cancelada' : uso.pausedForUser ? 'aguardando você' : 'em andamento'
  ].join(' · ');
}

async function atualizarDados() {
  const alvo = document.querySelector('#estado-dados');
  const dados = await read('/api/v1/persistence', { fallback: null });
  if (!alvo) return;
  if (!dados) { alvo.textContent = 'Não foi possível ler o diagnóstico dos dados agora.'; return; }
  const autoridade = dados.mode === 'sqlite' ? 'banco local' : 'arquivos legíveis';
  alvo.textContent = `Autoridade atual: ${autoridade}. Divergência detectada: ${dados.drift ? 'sim, precisa de decisão' : 'não'}.`;
  await atualizarConsistencia();
}

// Fecha a conta entre vaga processada, candidatura, evidência, eventos e metas.
async function atualizarConsistencia() {
  const alvo = document.querySelector('#consistencia');
  if (!alvo) return;
  const relatorio = await read('/api/v1/consistency', { fallback: null });
  if (!relatorio) { alvo.replaceChildren(); return; }
  if (relatorio.consistent) {
    alvo.replaceChildren(el('p', { class: 'apoio', text: `Contagem da campanha conferida: ${relatorio.confirmedOnce} candidatura(s) confirmada(s) com evidência e evento correspondentes.` }));
    return;
  }
  alvo.replaceChildren(el('div', { class: 'aviso', dataset: { tom: 'atencao' } }, [
    el('div', {}, [
      el('p', { text: 'A contagem da campanha não fecha com os registros:' }),
      el('ul', {}, (relatorio.divergences ?? []).map((item) => el('li', { class: 'quebra', text: `• ${item}` }))),
      el('p', { class: 'apoio', text: 'Nenhuma candidatura é reenviada por causa disso. Confira a candidatura envolvida antes de qualquer nova ação.' })
    ])
  ]));
}

async function operacaoDados(operacao, mensagem) {
  try {
    await send(`/api/v1/persistence/${operacao}`, {});
    notice(mensagem, 'sucesso');
    await atualizarDados();
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
    await atualizarDados();
  } catch (error) { notice(error.message, 'erro'); }
}

function bloco(rotulo, valor) {
  return el('div', { class: 'bloco' }, [
    el('span', { class: 'etiqueta', text: rotulo }),
    el('strong', { class: 'numero', text: valor })
  ]);
}

function rotuloModo(modo) {
  return { 'codex-app-server': 'automação completa', 'offline-read': 'somente leitura local' }[modo] ?? 'não determinado';
}

function rotuloAuth(auth) {
  return { password: 'login com senha da plataforma', manual: 'login manual na janela do navegador', 'link-convite': 'somente por convite' }[auth] ?? 'não informado';
}
