import { classifyError } from './error-classifier.mjs';

// Executor da agenda local. Enquanto o processo do Fluxo estiver aberto, ele
// dispara as consultas vencidas. Não promete execução com o app fechado.
export function createSchedulerRunner({
  schedulerService,
  followUpMonitor,
  notificationService,
  budget,
  tickMs = 60_000,
  onEvent = () => {},
  setTimer = setTimeout,
  clearTimer = clearTimeout
} = {}) {
  let timer = null;
  let ativo = false;

  const runner = {
    get running() { return ativo; },

    start() {
      if (ativo) return runner;
      ativo = true;
      agendarProximo();
      return runner;
    },

    stop() {
      ativo = false;
      if (timer) clearTimer(timer);
      timer = null;
      return runner;
    },

    // Uma passagem: usada pelo laço e pelos testes, sem depender de tempo real.
    async tick() {
      const vencidos = await schedulerService.due();
      const execucoes = [];
      for (const job of vencidos) {
        execucoes.push(await executar(job));
      }
      return execucoes;
    }
  };

  return runner;

  async function executar(job) {
    if (budget?.snapshot && budget.snapshot().cancelled === true) {
      // Campanha cancelada: a agenda para de avançar, mas o registro permanece.
      await schedulerService.finish(job.id, { skipAdvance: true });
      return { id: job.id, status: 'cancelado' };
    }
    try {
      // `begin` recusa sobreposição: duas consultas do mesmo job não coexistem.
      await schedulerService.begin(job.id);
    } catch (error) {
      return { id: job.id, status: 'ignorado', code: error?.code ?? 'schedule_overlap' };
    }
    try {
      budget?.assertCanAct?.('read');
      const resultado = await followUpMonitor.check(job.payload ?? {});
      await notificar(job, resultado);
      onEvent({ type: 'scheduler.checked', jobId: job.id, novidades: resultado.newEvents?.length ?? 0 });
      return { id: job.id, status: 'consultado', novidades: resultado.newEvents?.length ?? 0, resultado };
    } catch (error) {
      const classificado = classifyError(error);
      onEvent({ type: 'scheduler.failed', jobId: job.id, message: error.message, retryable: classificado.retryable });
      return { id: job.id, status: 'falhou', code: error?.code ?? '', retryable: classificado.retryable };
    } finally {
      await schedulerService.finish(job.id);
    }
  }

  async function notificar(job, resultado) {
    if (!notificationService?.notify) return;
    for (const evento of resultado.newEvents ?? []) {
      await notificationService.notify({
        kind: evento.type ?? 'followup',
        title: tituloNovidade(evento),
        body: evento.note ?? '',
        reference: evento.applicationId ?? evento.reference ?? '',
        nextAction: evento.nextAction ?? 'Abrir a candidatura e revisar o retorno.'
      });
    }
    for (const falha of resultado.failures ?? []) {
      if (falha.type !== 'unsupported') continue;
      // Ausência de adaptador não é "nenhuma novidade": vira aviso de conferência manual.
      await notificationService.notify({
        kind: 'followup_manual',
        title: 'Uma candidatura precisa de conferência manual',
        body: falha.message ?? 'Esta plataforma não tem consulta automática nesta versão.',
        reference: falha.reference ?? '',
        nextAction: 'Abrir a plataforma e registrar o retorno observado.'
      });
    }
  }

  function agendarProximo() {
    if (!ativo) return;
    timer = setTimer(async () => {
      try { await runner.tick(); } catch (error) { onEvent({ type: 'scheduler.failed', message: error.message }); }
      agendarProximo();
    }, tickMs);
    timer?.unref?.();
  }
}

function tituloNovidade(evento) {
  const titulos = {
    entrevista: 'Convite para entrevista',
    'teste pendente': 'Teste pendente',
    'teste concluído': 'Teste concluído',
    proposta: 'Proposta recebida',
    rejeitada: 'Processo encerrado pela empresa',
    triagem: 'Candidatura em triagem'
  };
  return titulos[evento.status ?? evento.type] ?? 'Novidade em uma candidatura';
}
