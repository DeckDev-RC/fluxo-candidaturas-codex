// Entrada da conversa. O pedido da pessoa entra na linha do tempo e a resposta
// do Fluxo também: preferência vira alteração revisável, consulta abre a área
// certa e o que ainda não é atendido é dito com clareza, sem fingir.

import { el } from '../../core/dom.mjs';
import { describeError } from '../../core/api.mjs';
import { corrigirFato } from '../../core/actions.mjs';
import { ask, say } from '../../core/conversa.mjs';
import { store } from '../../core/store.mjs';
import { currentRoute, go } from '../../core/router.mjs';
import { openDialog } from '../../ui/dialog.mjs';
import { abrirMudancaDeObjetivo } from './objetivo.mjs';

const ATALHOS = [
  { padrao: /(decis|aprov)/, rota: 'decisoes', resposta: 'Abri a caixa de decisões. As pendentes também aparecem aqui na conversa.' },
  { padrao: /(vaga|oportunidad)/, rota: 'oportunidades', resposta: 'Abri a lista de oportunidades encontradas para o seu objetivo.' },
  { padrao: /(candidatur|processo|entrevista)/, rota: 'candidaturas', resposta: 'Abri suas candidaturas e os processos em andamento.' },
  { padrao: /(perfil|curr[íi]culo|dado)/, rota: 'perfil', resposta: 'Abri seu perfil, com o que já está confirmado e o que ainda falta.' },
  { padrao: /(configura|plataforma|meta|limite)/, rota: 'configuracoes', resposta: 'Abri as configurações de plataformas, metas e limites.' }
];

export function bindConversationInput(form) {
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const campo = form.querySelector('input');
    const texto = campo.value.trim();
    if (!texto) return;
    campo.value = '';
    ask(texto);
    if (currentRoute() !== 'agora') go('agora');
    await interpretar(texto);
  });
}

async function interpretar(texto) {
  const normalizado = texto.toLocaleLowerCase();
  if (/(remot[oa]|h[íi]brid[oa]|presencia)/.test(normalizado)) return propostaDeModalidade(normalizado);
  if (/(objetivo|cargo|quero trabalhar)/.test(normalizado)) {
    say('Vamos ajustar seu objetivo. Confirme o texto na janela para eu usar nas próximas buscas.');
    abrirMudancaDeObjetivo({ aoSalvar: () => say('Objetivo atualizado. Vale para as próximas buscas; o trabalho já preparado continua como está.', { tom: 'sucesso' }) });
    return;
  }
  for (const atalho of ATALHOS) {
    if (atalho.padrao.test(normalizado)) { go(atalho.rota); say(atalho.resposta); return; }
  }
  say('Ainda não sei atender esse pedido pela conversa. Consigo ajustar objetivo e modalidade, abrir decisões, oportunidades, candidaturas, perfil e configurações. Para o resto, use as áreas na lateral.', { tom: 'atencao' });
}

// "só remoto" substitui as modalidades aceitas; "também híbrido" acrescenta.
function propostaDeModalidade(normalizado) {
  const modalidade = /remot/.test(normalizado) ? 'Remoto' : /presencia/.test(normalizado) ? 'Presencial' : 'Híbrido';
  const atuais = [store.estado?.memory?.facts?.workModes?.value ?? []].flat().filter(Boolean);
  const exclusivo = /\b(só|somente|apenas|exclusivamente)\b/.test(normalizado) || !atuais.length;
  const novas = exclusivo ? [modalidade] : [...new Set([...atuais, modalidade])];
  const descricao = exclusivo
    ? `aceitar apenas vagas ${modalidade.toLocaleLowerCase()}`
    : `aceitar também vagas ${modalidade.toLocaleLowerCase()}, além de ${atuais.join(', ').toLocaleLowerCase()}`;
  say(`Entendi que você quer ${descricao}. Isto altera as modalidades aceitas no seu perfil e vale para as próximas buscas. Confirme na janela.`);
  openDialog({
    title: 'Confirmar mudança de preferência',
    body: [el('p', { class: 'leitura', text: `Modalidades aceitas passam a ser: ${novas.join(', ')}. Confirmar?` })],
    actions: [
      { label: 'Não alterar', onSelect: () => { say('Preferência mantida como estava.'); } },
      {
        label: 'Confirmar modalidades',
        variant: 'primario',
        onSelect: async () => {
          try { await corrigirFato('workModes', novas); }
          catch (error) { say(describeError(error), { tom: 'erro' }); return false; }
          return true;
        }
      }
    ]
  });
}
