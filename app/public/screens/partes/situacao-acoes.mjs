// Ações oferecidas em cada situação da conversa. Toda ação diz o que faz e
// nenhuma dispara envio sem passar pelo portão de decisão.

import { button, el } from '../../core/dom.mjs';
import { store } from '../../core/store.mjs';
import { go } from '../../core/router.mjs';
import { conferirEnvio, consultarNovidades, encerrarCampanha, pausarJornada, retomarJornada } from '../../core/actions.mjs';
import { notice } from '../../ui/messages.mjs';

export function acoesDaSituacao(situacao, pendentes) {
  const acoes = [];
  const { estado } = situacao;
  if (estado === 'decisao-pendente' && pendentes.length > 3) {
    acoes.push(button('Ver todas as decisões', { variant: 'secundario', onClick: () => go('decisoes') }));
  }
  if (estado === 'envio-incerto') {
    acoes.push(button('Conferir na plataforma', { onClick: () => executar(() => conferirEnvio(store.jornada.runId)) }));
  }
  if (estado === 'acesso-indisponivel') {
    acoes.push(button('Resolver acesso', { onClick: () => go('configuracoes') }));
    acoes.push(button('Continuar revisando meus dados', { variant: 'secundario', onClick: () => go('perfil') }));
  }
  if (estado === 'pausada') {
    acoes.push(button('Retomar de onde parou', { onClick: () => executar(retomarJornada) }));
    acoes.push(button('Encerrar campanha', { variant: 'secundario', onClick: () => executar(encerrarCampanha) }));
  }
  if (estado === 'trabalhando') {
    acoes.push(button('Pausar', { variant: 'secundario', onClick: () => executar(pausarJornada) }));
    acoes.push(el('span', { class: 'ocupado', text: store.jornada.mensagem || 'Executando a próxima tarefa autorizada.' }));
  }
  if (estado === 'material-nao-lido') {
    acoes.push(button('Revisar o que entendi', { onClick: () => go('perfil') }));
  }
  if (estado === 'sem-vaga-adequada') {
    acoes.push(button('Ajustar filtros', { onClick: () => go('configuracoes') }));
    acoes.push(button('Consultar novidades agora', { variant: 'secundario', onClick: () => executar(consultarNovidades) }));
  }
  if (estado === 'campanha-concluida') {
    acoes.push(button('Acompanhar processos', { onClick: () => go('candidaturas') }));
  }
  if (estado === 'preparar-ambiente') {
    acoes.push(button('Abrir preparação', { onClick: () => go('configuracoes') }));
  }
  if (estado === 'pronta-para-buscar') {
    acoes.push(button('Procurar vagas agora', { onClick: () => go('primeiro-uso') }));
    acoes.push(button('Ver oportunidades já encontradas', { variant: 'secundario', onClick: () => go('oportunidades') }));
  }
  return acoes;
}

async function executar(acao) {
  try { await acao(); } catch (error) { notice(error.message, 'erro'); }
}
