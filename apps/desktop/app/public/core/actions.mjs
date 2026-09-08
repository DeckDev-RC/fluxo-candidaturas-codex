// Ações do candidato. Cada uma explica o efeito, atualiza o estado persistido
// e nunca anuncia sucesso que o serviço local não confirmou.

import { FluxoError, fileToBase64, send } from './api.mjs';
import { loadState, setJourney, store } from './store.mjs';
import { plural } from './rotulos.mjs';
import { connectJourney, forgetJourney } from './stream.mjs';
import { agentOperating, interruptConversation, nomePlataforma, resetConversation, sendTurn } from './conversa-ia.mjs';
import { ask } from './conversa.mjs';
import { notice } from '../ui/messages.mjs';

// Limite do serviço local para o arquivo (o corpo em base64 é ~35% maior).
const LIMITE_CURRICULO_BYTES = 12 * 1024 * 1024;

export async function importarCurriculo(file) {
  if (file.size > LIMITE_CURRICULO_BYTES) {
    throw new FluxoError(`O arquivo tem ${(file.size / (1024 * 1024)).toFixed(1)} MB; o limite é 12 MB. Exporte o currículo em PDF menor ou em TXT.`, 'resume_too_large');
  }
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
  // O objetivo digitado é resposta da pessoa: vira fato confirmado antes da
  // jornada, para o Fluxo não perguntar de novo o que acabou de ler.
  await send('/api/v1/memory/answers', { answers: { targetRoles: objetivo } });
  const importado = curriculo ? await importarCurriculo(curriculo) : null;
  const habilitadas = (store.estado?.campaign?.platforms ?? []).filter((item) => item.enabled !== false);
  const plataformas = habilitadas.map((item) => item.name);
  // Com a IA conectada, quem conduz é o agente: o cartão vira o brief da campanha.
  if (agentOperating()) return entregarAoAgente({ objetivo, importado, habilitadas });
  if (store.ia.disponivel && store.ia.capacidades?.tools === false) {
    throw new FluxoError('Conecte o ChatGPT/Codex em Configurações para iniciar a busca e operar o navegador.', 'codex_signed_out');
  }
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

async function entregarAoAgente({ objetivo, importado, habilitadas }) {
  const metas = habilitadas.map((item) => `${nomePlataforma(item.name)} (meta ${Number(item.goal ?? 0)})`).join(', ');
  const brief = [
    `Comecei a campanha pelo cartão de primeiro uso. Objetivo: ${objetivo}.`,
    importado ? `Currículo importado agora: ${importado.filename}.` : 'Currículo: o que já está registrado no meu perfil.',
    `Plataformas habilitadas e metas: ${metas || 'nenhuma'}.`,
    'Conduza a busca conforme o protocolo: leia meu perfil, pergunte só o que faltar e comece pela primeira plataforma.'
  ].join(' ');
  ask('Pode começar a busca com o que preenchi.');
  const resposta = await sendTurn(brief);
  setJourney({ runId: resposta?.runId ?? store.jornada.runId, status: 'trabalhando', mensagem: 'Estou conduzindo a busca.', plano: [], perguntas: [] });
  notice('Assumi a busca. Acompanhe aqui: peço login quando uma plataforma exigir e paro para você aprovar cada envio.', 'sucesso');
  await loadState();
  return resposta;
}

// A pessoa avisa que fez a parte dela (login, verificação) e o agente confere e segue.
export async function avisarQueTerminei(espera) {
  const texto = espera?.kind === 'login' || espera?.kind === 'challenge'
    ? `Já entrei no ${nomePlataforma(espera.platform)}. Confira a aba e continue.`
    : espera?.kind === 'consent'
      ? `Já decidi o aviso de cookies no ${nomePlataforma(espera.platform)}. Confira a aba e continue.`
      : 'Pode continuar.';
  ask(texto);
  return sendTurn(texto);
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
  if (agentOperating()) {
    const resultado = store.conversa.ocupada ? await interruptConversation() : { interrupted: false };
    setJourney({ status: 'pausada', mensagem: 'Jornada pausada. Nenhuma nova ação externa será iniciada.' });
    notice('Pausei. Uma ação externa já iniciada não é desfeita; retome quando quiser.', 'atencao');
    return resultado;
  }
  const runId = store.jornada.runId;
  if (!runId) return null;
  const resultado = await send(`/api/v1/runs/${encodeURIComponent(runId)}/interrupt`, {});
  setJourney({ status: 'pausada', mensagem: 'Jornada pausada. Nenhuma nova ação externa será iniciada.' });
  notice('Jornada pausada. Uma ação externa já iniciada não é desfeita.', 'atencao');
  return resultado;
}

export async function retomarJornada() {
  if (agentOperating()) {
    setJourney({ status: 'trabalhando', mensagem: 'Retomando de onde parei.' });
    return sendTurn('Retome a campanha de onde parou: confira o estado atual e siga o protocolo.', { system: true });
  }
  const runId = store.jornada.runId;
  if (!runId) return null;
  const resultado = await send(`/api/v1/runs/${encodeURIComponent(runId)}/resume`, {});
  setJourney({ status: 'trabalhando', mensagem: 'Jornada retomada.' });
  notice('Jornada retomada do ponto salvo.', 'sucesso');
  await loadState();
  return resultado;
}

export async function encerrarCampanha() {
  if (agentOperating()) {
    const resultado = await resetConversation();
    forgetJourney();
    setJourney({ runId: '', status: 'encerrada', mensagem: 'Campanha encerrada. A próxima busca começa uma conversa nova.', plano: [], perguntas: [] });
    notice('Campanha encerrada. Candidaturas já confirmadas continuam no histórico.', 'atencao');
    await loadState();
    return resultado;
  }
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
  const approval = store.aprovacoes.find((item) => item.id === id);
  const browserAction = approval?.kind === 'browser_action';
  await send(`/api/v1/approvals/${encodeURIComponent(id)}/decision`, { decision: decisao, actorId: 'local-user', ...(motivo ? { reason: motivo } : {}) });
  const revisao = revisoesPendentes.get(id);
  // Revisão pedida pelo agente condutor: a decisão volta para ele como evento
  // de sistema. Aprovar aqui nunca envia por conta própria; quem envia é a
  // ferramenta, com este approvalId.
  const doAgente = !revisao && agentOperating();
  if (decisao !== 'approved') {
    revisoesPendentes.delete(id);
    if (doAgente) {
      const text = browserAction
        ? `A pessoa rejeitou a ação de navegador ${id}${motivo ? ` (motivo: ${motivo})` : ''}. Não execute essa ação; informe o cancelamento e aguarde outra instrução.`
        : `A pessoa rejeitou a revisão ${id}${motivo ? ` (motivo: ${motivo})` : ''}. Não envie esta candidatura; siga para a próxima vaga ou pergunte o que ajustar.`;
      await sendTurn(text, { system: true }).catch(() => null);
    }
    notice(browserAction ? 'Ação de navegador cancelada.' : 'Revisão rejeitada. Nenhum envio foi feito e a vaga continua na lista.', 'atencao');
    await loadState();
    return { enviado: false, executado: false };
  }
  if (doAgente) {
    const text = browserAction
      ? `A pessoa aprovou a ação de navegador ${id} na interface. Repita exatamente a chamada browser_* que pediu a decisão, sem alterar página, alvo ou conteúdo, usando approvalId="${id}". Depois confira visualmente o resultado.`
      : `A pessoa aprovou a revisão ${id} na interface. Prossiga com fluxo_submit usando este approvalId e confirme o recebimento.`;
    await sendTurn(text, { system: true }).catch(() => null);
    notice(browserAction ? 'Ação aprovada. Vou executar exatamente o que você revisou.' : 'Aprovação registrada. Vou concluir o envio e confirmar aqui na conversa.', 'informacao');
    await loadState();
    return { enviado: false, executado: false, delegado: true };
  }
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
    novidades ? `${plural(novidades, 'novidade registrada', 'novidades registradas')} no histórico.` : 'Nenhuma novidade observada nas plataformas suportadas.',
    novidades ? 'sucesso' : 'informacao'
  );
  if (semAdaptador) notice(`${plural(semAdaptador, 'candidatura não tem', 'candidaturas não têm')} consulta automática nesta versão. Confira manualmente.`, 'atencao');
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
