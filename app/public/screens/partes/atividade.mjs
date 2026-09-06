// Atividade da IA na linha do tempo: passos seguidos ("Estado lido.", "Abrindo
// LinkedIn…") viram um bloco só, recolhido, com o passo em curso e o tempo total.
// Passos idênticos em sequência contam uma vez ("Estado lido ×10"). A pessoa abre
// o bloco quando quer ver o detalhe; o padrão é ler a conversa, não o log.

import { el } from '../../core/dom.mjs';

const abertos = new Set();
let temporizador = null;

export function ehPasso(mensagem) {
  return mensagem?.autor === 'fluxo' && (mensagem.tom === 'passo' || (mensagem.tom === 'atencao' && mensagem.duracaoMs !== undefined));
}

// `passos` são mensagens consecutivas de passo; `chave` identifica o grupo entre repinturas.
export function blocoDeAtividade(passos) {
  // A chave é a primeira etapa real: uma narração rebaixada para dentro do bloco
  // depois não muda a identidade dele (senão o bloco aberto fechava sozinho).
  const chave = (passos.find((passo) => !passo.narracao) ?? passos[0]).em;
  const emCurso = passos.some((passo) => passo.emAndamento);
  const falhas = passos.filter((passo) => passo.tom === 'atencao').length;
  const itens = compactar(passos);
  const inicio = Date.parse(passos[0].em);
  const fim = emCurso ? Date.now() : Math.max(...passos.map((passo) => Date.parse(passo.em) + Number(passo.duracaoMs ?? 0)));
  const atual = passos.find((passo) => passo.emAndamento) ?? passos.filter((passo) => !passo.narracao).at(-1) ?? passos.at(-1);
  const etapas = itens.filter((item) => !item.narracao).length;
  const rotulo = emCurso ? atual.texto.replace(/\.$/, '') : `${etapas === 1 ? '1 etapa' : `${etapas} etapas`}${falhas ? ` · ${falhas} com aviso` : ''}`;

  // `open` é propriedade booleana: '' seria falso e o bloco fechava a cada repintura.
  const detalhes = el('details', { class: 'atividade', dataset: { andamento: String(emCurso), falhas: String(falhas > 0) }, open: abertos.has(chave) }, [
    el('summary', { class: 'atividade-resumo' }, [
      el('span', { class: 'atividade-sinal', 'aria-hidden': 'true' }),
      el('span', { class: 'atividade-rotulo quebra', text: rotulo }),
      el('span', { class: 'atividade-tempo', dataset: emCurso ? { inicio: passos[0].em } : {}, text: duracao(fim - inicio) }),
      el('span', { class: 'atividade-seta', 'aria-hidden': 'true' })
    ]),
    el('ol', { class: 'atividade-lista' }, itens.map((item) => el('li', { dataset: { tom: item.tom, andamento: String(item.emAndamento), narracao: String(item.narracao) }, title: item.narracao ? item.texto : undefined }, [
      // Narração cabe numa linha (o texto inteiro fica no title); etapa quebra normalmente.
      el('span', { class: item.narracao ? 'atividade-narracao' : 'quebra', text: item.texto }),
      item.vezes > 1 ? el('span', { class: 'atividade-vezes', text: `×${item.vezes}` }) : null,
      Number(item.duracaoMs) >= 3000 ? el('span', { class: 'atividade-tempo', text: duracao(item.duracaoMs) }) : null
    ])))
  ]);
  detalhes.addEventListener('toggle', () => { if (detalhes.open) abertos.add(chave); else abertos.delete(chave); });
  if (emCurso && !temporizador) temporizador = setInterval(atualizarTempos, 1000);
  return el('li', { class: 'balao balao-atividade', dataset: { autor: 'fluxo' } }, [el('div', { class: 'balao-avatar' }), el('div', { class: 'balao-corpo' }, [detalhes])]);
}

// Sequências iguais ("Estado lido." dez vezes) viram um item com contagem.
function compactar(passos) {
  const itens = [];
  for (const passo of passos) {
    const ultimo = itens.at(-1);
    if (ultimo && ultimo.texto === passo.texto && ultimo.tom === passo.tom && !passo.emAndamento && !passo.narracao) { ultimo.vezes += 1; ultimo.duracaoMs = Number(ultimo.duracaoMs ?? 0) + Number(passo.duracaoMs ?? 0); continue; }
    itens.push({ texto: passo.texto, tom: passo.tom, emAndamento: Boolean(passo.emAndamento), narracao: Boolean(passo.narracao), duracaoMs: Number(passo.duracaoMs ?? 0), vezes: 1 });
  }
  return itens;
}

function duracao(ms) {
  const s = Math.max(0, Math.round(Number(ms) / 1000));
  if (s < 1) return '';
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}min ${s % 60}s`;
}

function atualizarTempos() {
  const vivos = document.querySelectorAll('.atividade[data-andamento="true"] .atividade-tempo[data-inicio]');
  if (!vivos.length) { clearInterval(temporizador); temporizador = null; return; }
  for (const no of vivos) no.textContent = duracao(Date.now() - Date.parse(no.dataset.inicio));
}
