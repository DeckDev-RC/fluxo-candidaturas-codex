// Retrato compacto do estado local para a conversa. Só fatos já redigidos pelo
// serviço de memória (sem segredo, sem dado sensível) e contagens; a situação
// segue a mesma prioridade da tela: primeiro uso, decisão, jornada, pronto.

import { readFluxoState } from './state-reader.mjs';

export async function retratoParaConversa({ rootDir, persistence, memoryService, approvalService, runService, runtimeHealth, browserAdapter = null }) {
  const [estado, memoria, saude, abas] = await Promise.all([
    readFluxoState(rootDir, { persistence }).catch(() => ({})),
    memoryService?.safeSummary?.().catch(() => ({ facts: {}, gaps: [] })) ?? { facts: {}, gaps: [] },
    runtimeHealth?.snapshot?.().catch(() => ({ available: false })) ?? { available: false },
    browserAdapter?.tabs?.().catch(() => []) ?? []
  ]);
  const fatos = memoria.facts ?? {};
  const confirmados = Object.entries(fatos).filter(([, fato]) => fato?.confirmed === true).map(([chave]) => chave);
  const plataformas = (estado.campaign?.platforms ?? []).filter((item) => item.enabled !== false);
  const aprovacoes = (approvalService?.listApprovals?.() ?? []).filter((item) => item.status === 'pending').length;
  const fila = (estado.queue?.items ?? []).filter((item) => ['na fila', 'em andamento'].includes(item.status)).length;
  const execucao = (runService?.listRuns?.() ?? []).filter((run) => run.kind === 'autopilot').at(-1) ?? null;
  const confirmadas = Number(estado.applications?.confirmedCount ?? 0);
  const metaTotal = Number(estado.campaign?.totalGoal ?? 0);

  // Mesma prioridade da tela. Uma execução "pausada" esperando a pessoa não é
  // pausa dela: a pausa deliberada deixa o evento run.paused sem retomada depois.
  const pausadaPelaPessoa = execucao?.status === 'paused' && pausouDeProposito(runService, execucao.id);
  let situacao = 'pronta para buscar';
  let mensagem = '';
  if (!confirmados.length || !plataformas.length) { situacao = 'primeiro uso'; mensagem = 'ainda faltam objetivo, currículo lido ou plataformas escolhidas'; }
  else if (aprovacoes) { situacao = 'decisão pendente'; mensagem = `${aprovacoes} aprovação(ões) de envio esperando a pessoa`; }
  else if (pausadaPelaPessoa) { situacao = 'jornada pausada pela pessoa'; mensagem = 'retomar pela fala atual'; }
  else if (metaTotal > 0 && confirmadas >= metaTotal) { situacao = 'meta atingida'; }
  else if (fila) { situacao = 'escolher vaga'; mensagem = 'há vagas na fila aguardando a escolha da pessoa; ela escolhe uma e clica em "Preparar candidatura para revisão"'; }
  else if (execucao?.status === 'running') { situacao = 'jornada em andamento'; }

  return {
    situacao,
    mensagem,
    iaDisponivel: saude.available === true,
    objetivo: fatos.targetRoles?.value ?? '',
    curriculo: memoria.selectedResume?.label ?? memoria.selectedResume?.path ?? '',
    fatosConfirmados: confirmados,
    lacunas: memoria.gaps ?? [],
    plataformas: plataformas.map((item) => ({ name: item.name, goal: item.goal ?? 0 })),
    confirmadas,
    metaTotal,
    fila,
    decisoes: aprovacoes,
    jornada: descreverExecucao(execucao, pausadaPelaPessoa),
    abas: (abas ?? []).map((aba) => ({ platform: aba.platform, loginPending: aba.loginPending === true, challenge: aba.challenge ?? null }))
  };
}

function pausouDeProposito(runService, runId) {
  const eventos = runService?.listEvents?.(runId) ?? [];
  const ultimo = [...eventos].reverse().find((evento) => evento.type === 'run.paused' || evento.type === 'run.resumed');
  return ultimo?.type === 'run.paused';
}

// Estado técnico da execução em palavras da pessoa; "paused" esperando decisão
// vira "aguardando você", não "pausada".
function descreverExecucao(execucao, pausadaPelaPessoa) {
  if (!execucao) return '';
  const estado = execucao.status === 'running' ? 'em andamento'
    : execucao.status === 'paused' ? (pausadaPelaPessoa ? 'pausada pela pessoa' : 'aguardando você')
    : execucao.status === 'succeeded' ? 'concluída'
    : execucao.status === 'cancelled' ? 'encerrada'
    : execucao.status;
  return `${estado}${execucao.goal ? ` — objetivo: ${execucao.goal}` : ''}`;
}
