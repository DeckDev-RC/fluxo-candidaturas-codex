// Fecha a conta entre vaga processada, candidatura registrada, evidência,
// eventos de confirmação e contadores da campanha (F5-05).
export function createConsistencyService({ readState, readRuns, listEvents } = {}) {
  return {
    async report() {
      const estado = await readState();
      const execucoes = (await readRuns?.()) ?? [];
      const eventos = execucoes.flatMap((run) => (listEvents?.(run.id) ?? []));
      const resultado = reconcileCampaignCounts({
        processed: (estado.queue?.items ?? []).filter((item) => item.status === 'processada'),
        applications: estado.applications?.items ?? [],
        events: eventos
      });
      const contadorEstado = Number(estado.applications?.confirmedCount ?? 0);
      const enviadasEmExecucoes = execucoes.reduce((total, run) => total + Number(run.submittedCount ?? 0), 0);
      const divergencias = [];
      if (!resultado.consistent) divergencias.push('A quantidade de candidaturas confirmadas não corresponde aos eventos de confirmação.');
      if (contadorEstado < resultado.confirmedOnce) divergencias.push('Há candidatura confirmada com evidência que não entrou na contagem da campanha.');
      if (enviadasEmExecucoes > resultado.confirmedOnce) divergencias.push('Uma execução contou envio sem candidatura confirmada correspondente.');
      return { ...resultado, campaignCount: contadorEstado, runSubmissions: enviadasEmExecucoes, divergences: divergencias, consistent: divergencias.length === 0 };
    }
  };
}

export function reconcileCampaignCounts({ processed = [], applications = [], events = [] } = {}) {
  const confirmed = applications.filter((item) => item.status === 'enviada' && item.evidencePath && item.confirmedAt);
  const keys = new Set();
  const unique = [];
  for (const item of confirmed) {
    const key = item.applicationId || item.key || item.id;
    if (keys.has(key)) continue;
    keys.add(key);
    unique.push(item);
  }
  const modelOnly = applications.filter((item) => item.source === 'model' && !item.evidencePath);
  return {
    processed: processed.length,
    confirmedOnce: unique.length,
    events: events.filter((event) => event.type === 'application.submission_confirmed').length,
    ignoredModelOnly: modelOnly.length,
    consistent: unique.length === events.filter((event) => event.type === 'application.submission_confirmed').length || events.length === 0
  };
}
