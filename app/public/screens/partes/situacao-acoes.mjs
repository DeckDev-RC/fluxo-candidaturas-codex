// Ações oferecidas em cada situação da conversa. Toda ação diz o que faz e
// nenhuma dispara envio sem passar pelo portão de decisão. Botões com ação
// assíncrona ficam ocupados e reportam falha por conta própria (dom.mjs).

import { button, el } from '../../core/dom.mjs';
import { store } from '../../core/store.mjs';
import { go } from '../../core/router.mjs';
import { conferirEnvio, consultarNovidades, encerrarCampanha, pausarJornada, retomarJornada } from '../../core/actions.mjs';

export function acoesDaSituacao(situacao, pendentes) {
  const acoes = [];
  const { estado } = situacao;
  if (estado === 'decisao-pendente' && pendentes.length > 3) {
    acoes.push(button('Ver todas as decisões', { variant: 'secundario', onClick: () => go('decisoes') }));
  }
  if (estado === 'envio-incerto') {
    acoes.push(button('Conferir na plataforma', { onClick: () => conferirEnvio(store.jornada.runId) }));
  }
  if (estado === 'acesso-indisponivel') {
    acoes.push(button('Resolver acesso', { onClick: () => go('configuracoes') }));
    acoes.push(button('Continuar revisando meus dados', { variant: 'secundario', onClick: () => go('perfil') }));
  }
  if (estado === 'pausada') {
    acoes.push(button('Retomar de onde parou', { onClick: retomarJornada }));
    acoes.push(button('Encerrar campanha', { variant: 'secundario', onClick: encerrarCampanha }));
  }
  if (estado === 'trabalhando') {
    acoes.push(button('Pausar', { variant: 'secundario', onClick: pausarJornada }));
    acoes.push(el('span', { class: 'ocupado', text: store.jornada.mensagem || 'Executando a próxima tarefa autorizada.' }));
  }
  if (estado === 'escolher-vaga') {
    const total = Number(situacao.quantidade ?? 0);
    acoes.push(button(total > 3 ? `Ver todas as ${total} oportunidades` : 'Ver oportunidades', { variant: 'secundario', onClick: () => go('oportunidades') }));
  }
  if (estado === 'material-nao-lido') {
    acoes.push(button('Revisar o que entendi', { onClick: () => go('perfil') }));
  }
  if (estado === 'sem-vaga-adequada') {
    acoes.push(button('Ajustar plataformas e metas', { onClick: () => go('configuracoes') }));
    acoes.push(button('Consultar novidades', { variant: 'secundario', onClick: consultarNovidades }));
  }
  if (estado === 'campanha-concluida') {
    acoes.push(button('Acompanhar processos', { onClick: () => go('candidaturas') }));
  }
  if (estado === 'preparar-ambiente') {
    acoes.push(button('Abrir preparação', { onClick: () => go('configuracoes') }));
  }
  if (estado === 'pronta-para-buscar') {
    // Sem IA conectada a busca não começa: o caminho certo é conectar primeiro.
    if (store.ia.estado && !store.ia.disponivel) acoes.push(button('Conectar o ChatGPT para buscar', { onClick: () => go('configuracoes') }));
    else acoes.push(button('Procurar vagas agora', { onClick: () => go('primeiro-uso') }));
    acoes.push(button('Ver oportunidades já encontradas', { variant: 'secundario', onClick: () => go('oportunidades') }));
  }
  return acoes;
}
