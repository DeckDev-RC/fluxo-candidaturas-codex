// Conta do ChatGPT conectada, modelo e esforço em uso, limites de uso (janela
// curta e semanal) e consumo. Tudo vem do app-server via serviço local, já sem
// credenciais. Só aparece com a IA conectada: sem conta não há o que mostrar.

import { badge, button, definitions, el, field, metric, panel } from '../../core/dom.mjs';
import { dataHora, numero } from '../../core/format.mjs';
import { loadAiStatus, store } from '../../core/store.mjs';
import { describeWindow, loadCodex, logoutCodex, resetsAt, saveCodexSettings } from '../../core/codex.mjs';
import { notice } from '../../ui/messages.mjs';
import { openDialog } from '../../ui/dialog.mjs';
import { rerender } from '../../core/router.mjs';

const ESFORCOS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const ROTULO_ESFORCO = { none: 'nenhum', minimal: 'mínimo', low: 'baixo', medium: 'médio', high: 'alto', xhigh: 'muito alto', max: 'máximo', ultra: 'ultra' };

export function codexPanel() {
  if (!store.ia.disponivel) return null;
  const codex = store.codex;
  if (!codex) {
    queueMicrotask(() => { loadCodex(); });
    return panel({ kicker: 'conta e modelo', title: 'Conta do ChatGPT', id: 'painel-codex', children: [el('span', { class: 'ocupado', text: 'Consultando conta, modelo e limites…' })] });
  }
  const conta = codex.account;
  return panel({
    kicker: 'conta e modelo',
    title: 'Conta do ChatGPT',
    id: 'painel-codex',
    actions: [badge(conta ? conta.planType || conta.type || 'conectada' : 'sem conta', conta ? 'sucesso' : 'atencao')],
    children: [
      conta
        ? definitions([['Conta', conta.email || 'e-mail não informado pelo Codex'], ['Plano', conta.planType || 'não informado']])
        : el('p', { class: 'apoio', text: codex.error?.message ?? 'O Codex não informou a conta conectada.' }),
      modeloEEsforco(codex),
      limites(codex.rateLimits),
      consumo(codex.usage),
      el('div', { class: 'linha-acoes' }, [
        button('Atualizar dados', { variant: 'secundario', onClick: async () => { await loadCodex({ refresh: true }); rerender(); } }),
        button('Sair da conta', { variant: 'texto', onClick: confirmarSaida }),
        codex.fetchedAt ? el('span', { class: 'apoio', text: `Lido em ${dataHora(codex.fetchedAt)}` }) : null
      ])
    ]
  });
}

// Modelo e esforço salvos no serviço local; valem para os próximos turnos.
function modeloEEsforco(codex) {
  const modelos = codex.models ?? [];
  const atual = codex.settings ?? {};
  const seletorModelo = el('select', { id: 'codex-modelo' }, modelos.map((modelo) => el('option', { value: modelo.id, selected: modelo.id === atual.model, text: modelo.displayName || modelo.id })));
  const seletorEsforco = el('select', { id: 'codex-esforco' });
  const preencherEsforcos = () => {
    const modelo = modelos.find((item) => item.id === seletorModelo.value);
    const opcoes = modelo?.efforts?.length ? modelo.efforts : ESFORCOS;
    const escolhido = opcoes.includes(seletorEsforco.value || atual.effort) ? (seletorEsforco.value || atual.effort) : (modelo?.defaultEffort || opcoes[Math.floor(opcoes.length / 2)]);
    seletorEsforco.replaceChildren(...opcoes.map((esforco) => el('option', { value: esforco, selected: esforco === escolhido, text: ROTULO_ESFORCO[esforco] ?? esforco })));
  };
  seletorModelo.addEventListener('change', preencherEsforcos);
  preencherEsforcos();

  if (!modelos.length) return el('p', { class: 'apoio', text: 'O Codex não listou modelos disponíveis para esta conta.' });
  return el('div', { class: 'campo' }, [
    el('div', { class: 'filtros' }, [
      field({ label: 'Modelo', control: seletorModelo, help: atual.model ? `Em uso: ${modelos.find((item) => item.id === atual.model)?.displayName ?? atual.model}` : 'Nenhum modelo salvo; o Codex usa o padrão.' }),
      field({ label: 'Esforço de raciocínio', control: seletorEsforco, help: 'Mais esforço, respostas mais cuidadosas e mais lentas.' })
    ]),
    el('div', { class: 'linha-acoes' }, [
      button('Salvar modelo e esforço', {
        id: 'salvar-codex',
        onClick: async () => {
          await saveCodexSettings({ model: seletorModelo.value, effort: seletorEsforco.value });
          notice('Modelo e esforço salvos. Valem para as próximas tarefas.', 'sucesso');
          rerender();
        }
      })
    ])
  ]);
}

// Duas janelas do ChatGPT: curta (em geral 5 h) e longa (em geral semanal).
function limites(rateLimits) {
  if (!rateLimits) return el('p', { class: 'apoio', text: 'Limites de uso não informados pelo Codex.' });
  const janelas = [
    ['Janela curta', rateLimits.primary, '5 h'],
    ['Janela longa', rateLimits.secondary, 'semanal']
  ].filter(([, limite]) => limite);
  if (!janelas.length) return null;
  return el('div', { class: 'limites' }, [
    el('span', { class: 'etiqueta', text: 'Limites de uso' }),
    ...janelas.map(([nome, limite, padrao]) => barraDeLimite(`${nome} (${describeWindow(limite, padrao)})`, limite))
  ]);
}

function barraDeLimite(rotulo, limite) {
  const usado = Math.max(0, Math.min(100, Number(limite.usedPercent ?? 0)));
  const reinicio = resetsAt(limite);
  const nivel = usado >= 90 ? 'erro' : usado >= 70 ? 'atencao' : 'normal';
  return el('div', { class: 'meta', dataset: { nivel } }, [
    el('div', { class: 'meta-linha' }, [
      el('span', { class: 'meta-rotulo', text: rotulo }),
      el('span', { class: 'meta-valor numero', text: `${numero(usado)}% usado` })
    ]),
    el('div', { class: 'meta-barra', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': usado, 'aria-label': `${rotulo}: ${usado}% usado` }, [
      el('span', { style: `width:${usado}%` })
    ]),
    reinicio ? el('span', { class: 'apoio', text: `Reinicia em ${dataHora(reinicio)}` }) : null
  ]);
}

function consumo(usage) {
  const total = Number(usage?.summary?.lifetimeTokens ?? usage?.summary?.totalTokens ?? 0);
  const dias = (usage?.dailyUsageBuckets ?? []).slice(-7);
  const semana = dias.reduce((soma, dia) => soma + Number(dia.tokens ?? dia.totalTokens ?? 0), 0);
  if (!total && !semana) return null;
  return el('div', { class: 'blocos' }, [
    dias.length ? metric('Tokens nos últimos 7 dias', numero(semana), `${dias.length} dia(s) com registro`) : null,
    total ? metric('Tokens desde o início', numero(total), 'informado pelo Codex') : null
  ]);
}


function confirmarSaida() {
  openDialog({
    title: 'Sair da conta do ChatGPT',
    body: [el('p', { class: 'leitura', text: 'A automação para até você entrar de novo. Seus dados, currículos e candidaturas continuam neste computador.' })],
    actions: [
      { label: 'Cancelar' },
      { label: 'Sair da conta', variant: 'perigo', onSelect: async () => {
        try { await logoutCodex(); await loadAiStatus(); notice('Sessão do ChatGPT removida.', 'atencao'); rerender(); }
        catch (error) { notice(error.message, 'erro'); return false; }
        return true;
      } }
    ]
  });
}
