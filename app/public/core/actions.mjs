// Ações do candidato. Cada uma explica o efeito, atualiza o estado persistido
// e nunca anuncia sucesso que o serviço local não confirmou.

import { FluxoError, fileToBase64, send } from './api.mjs';
import { loadState, setJourney, store } from './store.mjs';
import { connectJourney, forgetJourney } from './stream.mjs';
import { notice } from '../ui/messages.mjs';

export async function importarCurriculo(file) {
  const conteudo = await fileToBase64(file);
  const resultado = await send('/api/v1/resumes/import', { filename: file.name, contentBase64: conteudo });
  if (resultado.extraction?.ok === false) {
    notice(`O arquivo foi transferido e verificado, mas a leitura não terminou: ${resultado.extraction.pending}`, 'atencao');
  } else {
    notice(`Currículo importado e lido: ${resultado.filename}.`, 'sucesso');
  }
  await loadState();
  return resultado;
}

// Plataformas e metas da campanha. Só grava quando algo mudou de fato.
export async function salvarPlataformas(plataformas, { silencioso = false } = {}) {
  const atuais = store.estado?.campaign?.platforms ?? [];
  const iguais = plataformas.length === atuais.length && plataformas.every((item) => {
    const atual = atuais.find((outro) => outro.name === item.name);
    return atual && atual.enabled === item.enabled && Number(atual.goal ?? 0) === Number(item.goal ?? 0);
  });
  if (iguais) return false;
  await send('/api/v1/campaign', { platforms: plataformas }, { method: 'PUT' });
  if (!silencioso) notice('Plataformas e metas atualizadas. Vale para as próximas buscas.', 'sucesso');
  await loadState();
  return true;
}

export async function iniciarJornada({ objetivo, curriculo, plataformas: escolhidas }) {
  if (escolhidas) await salvarPlataformas(escolhidas, { silencioso: true });
  const importado = curriculo ? await importarCurriculo(curriculo) : null;
  const plataformas = (store.estado?.campaign?.platforms ?? []).filter((item) => item.enabled !== false).map((item) => item.name);
  const resposta = await send('/api/v1/autopilot/start', {
    intent: objetivo,
    targetRoles: objetivo,
    platforms: plataformas,
    resumePath: importado?.path ?? '',
    importedResume: importado
  });
  const runId = resposta.run?.id ?? '';
  setJourney({ runId, status: 'trabalhando', mensagem: 'A jornada começou.', plano: resposta.plan ?? [], perguntas: [] });
  if (runId) connectJourney(runId);
  notice('O Fluxo começou a trabalhar. Você será chamado somente quando uma decisão depender de você.', 'sucesso');
  await loadState();
  return resposta;
}

export async function responderLacunas(respostas) {
  await send('/api/v1/memory/answers', { answers: respostas });
  const runId = store.jornada.runId;
  if (!runId) {
    notice('Resposta guardada no seu perfil.', 'sucesso');
    await loadState();
    return null;
  }
  setJourney({ status: 'trabalhando', mensagem: 'Resposta registrada; retomando de onde parou.', perguntas: [] });
  const resultado = await send(`/api/v1/autopilot/${encodeURIComponent(runId)}/continue`, { answers: respostas });
  setJourney({ status: mapaStatus(resultado.status), mensagem: resultado.message ?? '', plano: resultado.plan ?? [], perguntas: resultado.result?.questions ?? [] });
  notice('Resposta registrada. A jornada continuou da tarefa correta.', 'sucesso');
  await loadState();
  return resultado;
}

export async function pausarJornada() {
  const runId = store.jornada.runId;
  if (!runId) return null;
  const resultado = await send(`/api/v1/runs/${encodeURIComponent(runId)}/interrupt`, {});
  setJourney({ status: 'pausada', mensagem: 'Jornada pausada. Nenhuma nova ação externa será iniciada.' });
  notice('Jornada pausada. Uma ação externa já iniciada não é desfeita.', 'atencao');
  return resultado;
}

export async function retomarJornada() {
  const runId = store.jornada.runId;
  if (!runId) return null;
  const resultado = await send(`/api/v1/runs/${encodeURIComponent(runId)}/resume`, {});
  setJourney({ status: 'trabalhando', mensagem: 'Jornada retomada.' });
  notice('Jornada retomada do ponto salvo.', 'sucesso');
  await loadState();
  return resultado;
}

export async function encerrarCampanha() {
  const runId = store.jornada.runId;
  if (!runId) return null;
  const resultado = await send(`/api/v1/autopilot/${encodeURIComponent(runId)}/cancel`, {});
  forgetJourney();
  setJourney({ status: 'encerrada', mensagem: 'Campanha encerrada. Tarefas filhas foram interrompidas.' });
  notice('Campanha encerrada. Candidaturas já confirmadas continuam no histórico.', 'atencao');
  await loadState();
  return resultado;
}

export async function prepararCandidatura({ itemId = '', platform = '' } = {}) {
  const preparada = await send('/api/v1/applications/prepare', { itemId, platform });
  notice('Candidatura preparada. Revise antes de aprovar o envio.', 'informacao');
  return preparada;
}

// Revisões aguardando decisão. Depois do "aprovar", a tarefa autorizada segue
// sozinha até a confirmação: ninguém precisa repetir um "continue".
const revisoesPendentes = new Map();

export async function pedirAprovacao(preparada) {
  const runId = preparada?.run?.id;
  if (!runId) throw new FluxoError('A preparação não devolveu uma execução. Prepare a candidatura novamente.', 'run_missing');
  const payload = {
    queueItemId: preparada.item?.id,
    fields: preparada.snapshot ?? {},
    resume: preparada.resume?.path ?? ''
  };
  const aprovacao = await send(`/api/v1/applications/${encodeURIComponent(runId)}/approval`, payload);
  if (aprovacao?.id) revisoesPendentes.set(aprovacao.id, { preparada, payload });
  await loadState();
  return { aprovacao, payload };
}

export async function decidirAprovacao(id, decisao, motivo = '') {
  await send(`/api/v1/approvals/${encodeURIComponent(id)}/decision`, { decision: decisao, actorId: 'local-user', ...(motivo ? { reason: motivo } : {}) });
  if (decisao !== 'approved') {
    revisoesPendentes.delete(id);
    notice('Revisão rejeitada. Nenhum envio foi feito e a vaga continua na lista.', 'atencao');
    await loadState();
    return { enviado: false };
  }
  const revisao = revisoesPendentes.get(id);
  if (!revisao) {
    notice('Aprovação registrada. Prepare a candidatura novamente para executar esta revisão.', 'atencao');
    await loadState();
    return { enviado: false };
  }
  notice('Aprovação registrada. Executando exatamente a revisão aprovada…', 'informacao');
  try {
    const resultado = await enviarCandidatura({ preparada: revisao.preparada, aprovacao: { id }, payload: revisao.payload });
    revisoesPendentes.delete(id);
    return { enviado: true, resultado };
  } catch (error) {
    notice(`${error.message} Nada foi contado como enviado.`, 'erro');
    await loadState();
    return { enviado: false, erro: error };
  }
}

export async function enviarCandidatura({ preparada, aprovacao, payload }) {
  const runId = preparada.run?.id;
  const resultado = await send(`/api/v1/applications/${encodeURIComponent(runId)}/submit`, { approvalId: aprovacao.id, ...payload });
  notice('A plataforma confirmou o recebimento. A evidência foi guardada neste computador.', 'sucesso');
  await loadState();
  return resultado;
}

// Retomar uma candidatura preparada reconcilia o resultado observado na
// plataforma. Nunca repete o clique de envio.
export async function conferirEnvio(runId) {
  if (!runId) throw new FluxoError('Esta candidatura não tem execução associada para conferir. Abra a vaga na plataforma e verifique manualmente.', 'run_missing');
  const resultado = await send(`/api/v1/runs/${encodeURIComponent(runId)}/resume`, {});
  notice('Conferência concluída com a página da plataforma. O envio não foi repetido.', 'sucesso');
  await loadState();
  return resultado;
}

export async function consultarNovidades() {
  const resultado = await send('/api/v1/followup/check', { instruction: 'acompanhar candidaturas em andamento' });
  const novidades = resultado.newEvents?.length ?? 0;
  const semAdaptador = (resultado.failures ?? []).filter((falha) => falha.type === 'unsupported').length;
  notice(
    novidades ? `${novidades} novidade(s) registrada(s) no histórico.` : 'Nenhuma novidade observada nas plataformas suportadas.',
    novidades ? 'sucesso' : 'informacao'
  );
  if (semAdaptador) notice(`${semAdaptador} candidatura(s) não têm consulta automática nesta versão. Confira manualmente.`, 'atencao');
  await loadState();
  return resultado;
}

export async function agendarAcompanhamento(intervaloMinutos) {
  const resultado = await send('/api/v1/scheduler/jobs', { id: 'followup', intervalMs: Number(intervaloMinutos) * 60000 });
  // O serviço pode elevar o intervalo ao mínimo permitido: o aviso diz o valor real.
  const minutos = Math.round(Number(resultado?.intervalMs ?? intervaloMinutos * 60000) / 60000);
  notice(`Acompanhamento agendado a cada ${minutos} minutos, enquanto o Fluxo estiver aberto.`, 'sucesso');
  await loadState();
  return resultado;
}

export async function cancelarAcompanhamento() {
  await send('/api/v1/scheduler/jobs/followup', {}, { method: 'DELETE' });
  notice('Consulta automática cancelada. Você continua podendo consultar quando quiser.', 'informacao');
  await loadState();
}

export async function corrigirFato(chave, valor) {
  await send('/api/v1/memory/answers', { answers: { [chave]: valor } });
  notice('Informação atualizada no seu perfil. Novas candidaturas usam o valor corrigido.', 'sucesso');
  await loadState();
}

// Resolver divergência é escolha da pessoa: grava o valor escolhido e fecha o conflito.
export async function resolverConflito(chave, valor) {
  await send(`/api/v1/memory/conflicts/${encodeURIComponent(chave)}/resolve`, { value: valor });
  notice('Divergência resolvida com o valor que você escolheu.', 'sucesso');
  await loadState();
}

export async function removerFato(chave) {
  await send(`/api/v1/memory/facts/${encodeURIComponent(chave)}`, {}, { method: 'DELETE' });
  notice('Informação removida do perfil. O histórico de candidaturas não muda.', 'atencao');
  await loadState();
}

export async function atualizarObjetivo(objetivo) {
  await send('/api/v1/memory/answers', { answers: { targetRoles: objetivo } });
  notice('Objetivo atualizado. Vale para as próximas buscas; o trabalho já preparado continua como está.', 'sucesso');
  await loadState();
}

export async function executarPreparacao() {
  const resultado = await send('/api/v1/preflight/run', {});
  await loadState();
  return resultado;
}


function mapaStatus(status) {
  return { waiting_user: 'decisao', running: 'trabalhando', succeeded: 'concluida', needs_attention: 'bloqueio' }[status] ?? status;
}
