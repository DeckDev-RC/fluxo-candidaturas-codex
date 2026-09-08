// Caixa de decisões: o que depende da sua autorização, por urgência e impacto.
// Cada item diz por que precisa de você e o que acontece depois (U6).

import { badge, button, definitions, el, emptyState, field, panel, screen, staticListItem } from '../core/dom.mjs';
import { selectId } from '../ui/list-detail.mjs';
import { dataHora } from '../core/format.mjs';
import { decisions, store } from '../core/store.mjs';
import { decidirAprovacao, responderLacunas } from '../core/actions.mjs';
import { notice } from '../ui/messages.mjs';
import { openDialog } from '../ui/dialog.mjs';
import { go, rerender } from '../core/router.mjs';

const URGENCIA = { aprovacao: 0, informacao: 1, bloqueio: 2, excecao: 3 };

const EXPLICACOES = {
  aprovacao: 'Nada é enviado à empresa sem esta aprovação. Ao aprovar, o Fluxo executa exatamente a revisão exibida.',
  informacao: 'O Fluxo parou para não inventar um dado seu. Ao responder, a jornada continua da tarefa onde parou.',
  bloqueio: 'Uma tarefa não pôde continuar. Resolver aqui evita tentativa repetida na plataforma.',
  excecao: 'Uma situação precisa do seu contexto antes de o Fluxo seguir.'
};

export function decisoesScreen() {
  const itens = decisions().sort((a, b) => URGENCIA[a.tipo] - URGENCIA[b.tipo]);
  return screen({
    title: itens.length ? `${itens.length} ${itens.length === 1 ? 'item espera' : 'itens esperam'} por você` : 'Nenhuma decisão pendente',
    lead: 'Aqui ficam apenas escolhas que dependem de você: aprovar um envio, confirmar uma informação, resolver um acesso ou conferir um resultado incerto.',
    children: itens.length
      ? panel({ children: decisionList(itens) })
      : panel({ children: emptyState('Você está em dia', 'Quando o Fluxo precisar de uma autorização ou de um dado seu, o item aparece aqui e no indicador do topo.', button('Voltar para a conversa', { variant: 'secundario', onClick: () => go('agora') })) })
  });
}

export function decisionList(itens) {
  if (!itens.length) return emptyState('Nenhuma decisão pendente', 'O Fluxo continua trabalhando e chama você somente quando precisar.');
  // Sem detalhe próprio, a explicação do tipo aparece uma vez só.
  return el('ul', { class: 'lista', id: 'lista-decisoes' }, itens.map((item) => staticListItem({
    title: item.titulo,
    support: item.detalhe || EXPLICACOES[item.tipo],
    detail: item.detalhe ? EXPLICACOES[item.tipo] : '',
    right: [
      badge(rotuloTipo(item.tipo), item.tipo === 'aprovacao' ? 'acao' : item.tipo === 'bloqueio' ? 'erro' : 'atencao'),
      acaoDoItem(item)
    ]
  })));
}

function acaoDoItem(item) {
  if (item.tipo === 'aprovacao') {
    return button('Revisar', { onClick: () => abrirRevisao(item.aprovacao) });
  }
  if (item.tipo === 'informacao') {
    return button('Responder', { onClick: abrirPerguntas });
  }
  if (item.tipo === 'bloqueio') {
    // A vaga bloqueada está na fila: abre a oportunidade certa, já selecionada.
    return button('Ver oportunidade', { variant: 'secundario', onClick: () => { selectId('oportunidades', item.id); go('oportunidades'); } });
  }
  return button('Abrir', { variant: 'secundario', onClick: () => go('candidaturas') });
}

// Revisão pré-envio: leitura completa e ação inequívoca (U6-02, U6-03).
export function abrirRevisao(aprovacao) {
  const conteudo = aprovacao.payloadSummary?.payload ?? {};
  const vaga = (store.estado?.queue?.items ?? []).find((item) => item.id === conteudo.queueItemId) ?? {};
  const campos = conteudo.fields?.formValues ?? {};
  const expirada = aprovacao.expiresAt && Date.parse(aprovacao.expiresAt) < Date.now();
  const empresa = vaga.company ?? '';
  const titulo = empresa ? `Aprovar envio para ${empresa}` : 'Aprovar envio desta candidatura';

  openDialog({
    title: titulo,
    body: [
      expirada
        ? el('div', { class: 'aviso', dataset: { tom: 'atencao' } }, [el('p', { text: 'Esta revisão perdeu a validade. Prepare a candidatura novamente para gerar uma revisão atual.' })])
        : el('p', { class: 'apoio', text: `Revisão válida até ${dataHora(aprovacao.expiresAt)}.` }),
      definitions([
        ['Empresa', vaga.company],
        ['Cargo', vaga.role],
        ['Plataforma', vaga.platform],
        ['Endereço da vaga', vaga.identifierOrUrl],
        ['Currículo anexado', conteudo.resume || 'nenhum documento anexado'],
        ...Object.entries(campos).map(([campo, valor]) => [rotuloCampo(campo), String(valor || 'em branco')])
      ]),
      el('p', { class: 'leitura apoio', text: 'Ao aprovar, o Fluxo envia exatamente esta revisão. Se a página ou o conteúdo mudarem, a aprovação deixa de valer e uma nova revisão é exigida.' }),
      el('details', { class: 'suporte' }, [
        el('summary', { text: 'Detalhes técnicos desta aprovação' }),
        el('pre', { text: `identificador: ${aprovacao.id}\nverificação: ${aprovacao.payloadHash ?? 'não informada'}` })
      ])
    ],
    actions: [
      { label: 'Rejeitar', variant: 'perigo', onSelect: () => registrar(aprovacao.id, 'rejected') },
      { label: 'Voltar sem decidir' },
      ...(expirada ? [] : [{ label: titulo, variant: 'primario', onSelect: () => registrar(aprovacao.id, 'approved') }])
    ]
  });
}

function abrirPerguntas() {
  const perguntas = store.jornada.perguntas ?? [];
  const entradas = new Map();
  openDialog({
    title: 'Confirmar uma informação',
    body: [
      el('p', { class: 'leitura secundario', text: store.jornada.mensagem || 'O Fluxo precisa desta informação para continuar com segurança.' }),
      el('div', { class: 'escolhas', id: 'perguntas-lacuna' }, perguntas.map((pergunta) => {
        const entrada = el('input', { name: pergunta.key, id: `lacuna-${pergunta.key}` });
        entradas.set(pergunta.key, entrada);
        return field({ label: pergunta.prompt ?? `Qual é o valor de ${pergunta.key}?`, control: entrada, help: 'Fica guardado no seu perfil e não será perguntado de novo.' });
      })),
      perguntas.length ? null : el('p', { class: 'apoio', text: 'Nenhuma pergunta aberta neste momento.' })
    ],
    actions: [
      { label: 'Voltar sem responder' },
      {
        label: 'Responder e continuar',
        variant: 'primario',
        onSelect: async () => {
          const respostas = Object.fromEntries([...entradas].map(([chave, campo]) => [chave, campo.value.trim()]).filter(([, valor]) => valor));
          if (!Object.keys(respostas).length) { notice('Responda ao menos uma pergunta para continuar.', 'atencao'); return false; }
          try { await responderLacunas(respostas); rerender(); } catch (error) { notice(error.message, 'erro'); return false; }
          return true;
        }
      }
    ]
  });
}

async function registrar(id, decisao) {
  try {
    await decidirAprovacao(id, decisao);
    rerender();
  } catch (error) {
    notice(error.message, 'erro');
    return false;
  }
  return true;
}

// Nomes técnicos de campo do formulário da plataforma, em linguagem da pessoa.
const ROTULOS_CAMPO = {
  name: 'Nome', fullname: 'Nome completo', email: 'E-mail', phone: 'Telefone', telephone: 'Telefone', mobile: 'Celular',
  note: 'Observações', notes: 'Observações', message: 'Mensagem', cover: 'Carta de apresentação', salary: 'Pretensão salarial',
  linkedin: 'LinkedIn', location: 'Localização', city: 'Cidade', resume: 'Currículo', cv: 'Currículo'
};

function rotuloCampo(campo) {
  const chave = String(campo).toLowerCase().replace(/[^a-z]/g, '');
  return ROTULOS_CAMPO[chave] ?? `Campo "${campo}"`;
}

function rotuloTipo(tipo) {
  return { aprovacao: 'aprovação', informacao: 'informação', bloqueio: 'bloqueio', excecao: 'exceção' }[tipo] ?? tipo;
}
