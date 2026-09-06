// Cartões interativos que a IA pede na conversa (linha "AÇÃO: …" da resposta):
// seleção de vagas para descartar, confirmação dos dados lidos do currículo e
// respostas rápidas. O cartão vive no estado até a pessoa agir; a decisão volta
// para a IA como evento de sistema, com o mesmo portão de sempre: nada acontece
// sem o clique da pessoa.

import { badge, button, el } from '../../core/dom.mjs';
import { describeError, send } from '../../core/api.mjs';
import { nivelAderencia } from '../../core/aderencia.mjs';
import { ask, say } from '../../core/conversa.mjs';
import { sendTurn } from '../../core/conversa-ia.mjs';
import { loadState, setConversation, store } from '../../core/store.mjs';
import { notice } from '../../ui/messages.mjs';

const ROTULOS = { name: 'Nome', email: 'E-mail', phone: 'Telefone', location: 'Localização', targetRoles: 'Cargos-alvo', seniority: 'Senioridade', workModes: 'Modalidades', minimumSalary: 'Pretensão mínima', availability: 'Disponibilidade' };
const ATIVAS = new Set(['na fila', 'em andamento']);

// Chamado pelo executor de ações da conversa. Devolve true quando reconheceu a ação.
export function abrirCartaoDaIa({ tipo, valor }) {
  if (tipo === 'selecionar-descarte') {
    const ids = valor.trim().toLowerCase() === 'todas' ? null : valor.split(',').map((id) => id.trim()).filter(Boolean);
    setConversation({ cartao: { tipo: 'descarte', ids, marcadas: new Set() } });
    return true;
  }
  if (tipo === 'confirmar') {
    const campos = valor.split('|').map((par) => par.split(':')).filter(([chave, ...resto]) => chave?.trim() && resto.length).map(([chave, ...resto]) => ({ chave: chave.trim(), valor: resto.join(':').trim() }));
    if (!campos.length) return true;
    setConversation({ cartao: { tipo: 'confirmar', campos } });
    return true;
  }
  if (tipo === 'opcoes') {
    const opcoes = valor.split('|').map((opcao) => opcao.trim()).filter(Boolean).slice(0, 5);
    if (opcoes.length) setConversation({ cartao: { tipo: 'opcoes', opcoes } });
    return true;
  }
  return false;
}

export function fecharCartaoDaIa() { setConversation({ cartao: null }); }

export function cartaoDaIa() {
  const cartao = store.conversa?.cartao;
  if (!cartao) return null;
  const corpo = cartao.tipo === 'descarte' ? cartaoDescarte(cartao) : cartao.tipo === 'confirmar' ? cartaoConfirmar(cartao) : cartao.tipo === 'opcoes' ? cartaoOpcoes(cartao) : null;
  if (!corpo) return null;
  return el('li', { class: 'balao balao-cartao-ia', dataset: { autor: 'fluxo' } }, [el('div', { class: 'balao-avatar' }), el('div', { class: 'balao-corpo' }, [corpo])]);
}

// Vagas ativas com caixas de marcar; "Descartar selecionadas" avisa a IA do resultado.
function cartaoDescarte(cartao) {
  const itens = (store.estado?.queue?.items ?? []).filter((item) => ATIVAS.has(item.status) && (!cartao.ids || cartao.ids.includes(item.id) || cartao.ids.includes(item.key)));
  if (!itens.length) return el('p', { class: 'apoio', text: 'Não há vagas ativas para descartar.' });
  const linhas = itens.map((item) => {
    const caixa = el('input', { type: 'checkbox', id: `descarte-${item.id}`, checked: cartao.marcadas.has(item.id), onChange: (evento) => { if (evento.target.checked) cartao.marcadas.add(item.id); else cartao.marcadas.delete(item.id); atualizarContador(); } });
    return el('li', { class: 'cartao-ia-item' }, [
      caixa,
      el('label', { for: `descarte-${item.id}` }, [
        el('span', { class: 'item-titulo quebra', text: item.role ?? 'Vaga' }),
        el('span', { class: 'apoio quebra', text: ` ${item.company ?? 'empresa não informada'} · ${item.platform ?? ''}${item.searchQuery ? ` · busca "${item.searchQuery}"` : ''}` })
      ]),
      badge(nivelAderencia(item).rotulo, nivelAderencia(item).tom)
    ]);
  });
  const contador = el('span', { class: 'apoio', id: 'descarte-contador', text: `${cartao.marcadas.size} selecionada(s)` });
  function atualizarContador() { contador.textContent = `${cartao.marcadas.size} selecionada(s)`; }
  return el('div', { class: 'cartao-ia' }, [
    el('p', { class: 'cartao-ia-titulo', text: 'Marque as vagas que quer descartar' }),
    el('div', { class: 'linha-acoes' }, [
      button('Marcar todas', { variant: 'texto', onClick: () => { for (const item of itens) cartao.marcadas.add(item.id); for (const caixa of document.querySelectorAll('.cartao-ia input[type=checkbox]')) caixa.checked = true; atualizarContador(); } }),
      button('Desmarcar', { variant: 'texto', onClick: () => { cartao.marcadas.clear(); for (const caixa of document.querySelectorAll('.cartao-ia input[type=checkbox]')) caixa.checked = false; atualizarContador(); } })
    ]),
    el('ul', { class: 'cartao-ia-lista' }, linhas),
    el('div', { class: 'linha-acoes' }, [
      button('Descartar selecionadas', { onClick: () => descartarSelecionadas(cartao, itens) }),
      button('Deixar como está', { variant: 'secundario', onClick: () => { fecharCartaoDaIa(); ask('Deixe a fila como está.'); return sendTurn('Deixe a fila como está.'); } }),
      contador
    ])
  ]);
}

async function descartarSelecionadas(cartao, itens) {
  const ids = [...cartao.marcadas];
  if (!ids.length) { notice('Marque ao menos uma vaga para descartar.', 'atencao'); return; }
  try {
    const resultado = await send('/api/v1/queue/discard', { ids, reason: 'escolhidas pela pessoa no cartão de descarte' });
    fecharCartaoDaIa();
    const nomes = itens.filter((item) => ids.includes(item.id)).map((item) => `${item.role} (${item.company})`);
    notice(`${resultado.discarded} vaga(s) descartada(s); ${resultado.remaining} continuam na fila.`, 'informacao');
    await loadState();
    await sendTurn(`A pessoa descartou ${resultado.discarded} vaga(s) pelo cartão: ${nomes.join('; ')}. Restam ${resultado.remaining} ativas. Continue de onde estava.`, { system: true }).catch(() => null);
  } catch (error) { say(describeError(error), { tom: 'erro' }); }
}

// Dados lidos do currículo, editáveis; "Está certo" grava tudo confirmado de uma vez.
function cartaoConfirmar(cartao) {
  const campos = cartao.campos.map(({ chave, valor }) => {
    const entrada = el('input', { type: 'text', id: `confirmar-${chave}`, value: valor, 'aria-label': ROTULOS[chave] ?? chave });
    return { chave, entrada, linha: el('div', { class: 'campo' }, [el('label', { for: `confirmar-${chave}`, text: ROTULOS[chave] ?? chave }), entrada]) };
  });
  return el('div', { class: 'cartao-ia' }, [
    el('p', { class: 'cartao-ia-titulo', text: 'Li isto no seu currículo. Corrija o que precisar e confirme.' }),
    el('div', { class: 'cartao-ia-campos' }, campos.map((campo) => campo.linha)),
    el('div', { class: 'linha-acoes' }, [
      button('Está certo, confirmar', { onClick: async () => {
        const answers = Object.fromEntries(campos.map(({ chave, entrada }) => [chave, entrada.value.trim()]).filter(([, v]) => v));
        if (!Object.keys(answers).length) { notice('Preencha ao menos um campo.', 'atencao'); return; }
        try {
          await send('/api/v1/memory/answers', { answers });
          fecharCartaoDaIa();
          notice('Dados confirmados no seu perfil.', 'sucesso');
          await loadState();
          await sendTurn(`A pessoa confirmou pelo cartão: ${Object.entries(answers).map(([chave, v]) => `${ROTULOS[chave] ?? chave} = ${v}`).join('; ')}. Já estão gravados como confirmados; não grave de novo. Continue.`, { system: true }).catch(() => null);
        } catch (error) { say(describeError(error), { tom: 'erro' }); }
      } }),
      button('Prefiro responder por escrito', { variant: 'texto', onClick: () => { fecharCartaoDaIa(); } })
    ])
  ]);
}

// Botões que enviam o texto como fala da pessoa.
function cartaoOpcoes(cartao) {
  return el('div', { class: 'cartao-ia cartao-ia-opcoes' }, cartao.opcoes.map((opcao) => button(opcao, { variant: 'secundario', onClick: () => { fecharCartaoDaIa(); ask(opcao); return sendTurn(opcao); } })));
}
