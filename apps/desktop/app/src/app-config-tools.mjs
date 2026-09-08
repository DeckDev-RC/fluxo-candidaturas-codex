// Ferramentas de configuração do app para a IA (fluxo_campaign, fluxo_schedule,
// fluxo_codex_settings, fluxo_export). São as mesmas operações que a interface
// oferece em Configurações e Candidaturas, com as mesmas validações dos serviços.
// Fora daqui, por desenho: credenciais, login/logout do ChatGPT, aprovação de
// envio, exclusão de histórico e troca da pasta de dados.

export function appConfigTools({ campaignService, schedulerService, codexSettingsService, exportService, auditService, runService, string, opcional }) {
  const lista = { type: 'object' };
  return [
    ['fluxo_campaign', 'Ler ou ajustar a campanha: plataformas habilitadas e meta de cada uma, meta total, limites. Sem argumentos, só lê. platforms: { "GUPY": { "enabled": true, "goal": 10 }, "LINKEDIN": { "enabled": false } } (parcial; as não citadas ficam como estão). totalGoal opcional; sem ele, vira a soma das metas habilitadas.', { platforms: opcional('object'), totalGoal: opcional('number'), maxApplicationsPerRun: opcional('number') }, async (input) => {
      if (!campaignService) throw erro('campaign_unavailable', 'A campanha não está disponível neste ambiente.');
      const atual = await campaignService.getCampaign();
      if (!input.platforms && input.totalGoal === undefined && input.maxApplicationsPerRun === undefined) return resumoDaCampanha(atual, await campaignService.listPlatforms());
      const conhecidas = await campaignService.listPlatforms();
      const porNome = new Map((atual.platforms ?? []).map((item) => [String(item.name).toUpperCase(), item]));
      for (const [nome, ajuste] of Object.entries(input.platforms ?? {})) {
        const chave = String(nome).toUpperCase();
        if (!conhecidas.some((item) => item.name === chave)) throw erro('invalid_platform', `Plataforma desconhecida: ${nome}. Válidas: ${conhecidas.map((item) => item.name).join(', ')}.`);
        const existente = porNome.get(chave) ?? { name: chave, enabled: false, goal: 0 };
        porNome.set(chave, { ...existente, enabled: ajuste?.enabled === undefined ? existente.enabled === true : ajuste.enabled === true, goal: ajuste?.goal === undefined ? Number(existente.goal ?? 0) : Number(ajuste.goal) });
      }
      const platforms = [...porNome.values()];
      const soma = platforms.filter((item) => item.enabled).reduce((total, item) => total + Number(item.goal ?? 0), 0);
      const patch = { platforms, totalGoal: input.totalGoal === undefined ? soma : Number(input.totalGoal) };
      if (input.maxApplicationsPerRun !== undefined) patch.maxApplicationsPerRun = Number(input.maxApplicationsPerRun);
      const salvo = await campaignService.updateCampaign(patch);
      return { updated: true, ...resumoDaCampanha(salvo, conhecidas) };
    }],
    ['fluxo_schedule', 'Consulta automática de novidades das candidaturas: action=status|set|cancel. set aceita intervalMinutes (mínimo do app, normalmente 30).', { action: string, intervalMinutes: opcional('number') }, async (input) => {
      if (!schedulerService) throw erro('scheduler_unavailable', 'O agendamento não está disponível neste ambiente.');
      const acao = String(input.action);
      if (acao === 'set') { const job = await schedulerService.schedule({ id: 'followup', intervalMs: Math.max(1, Number(input.intervalMinutes) || 30) * 60_000 }); return { scheduled: true, intervalMinutes: Math.round(job.intervalMs / 60_000), nextAt: job.nextAt }; }
      if (acao === 'cancel') { await schedulerService.remove('followup'); return { scheduled: false }; }
      const job = (await schedulerService.list()).find((item) => item.id === 'followup');
      return job ? { scheduled: true, intervalMinutes: Math.round(job.intervalMs / 60_000), nextAt: job.nextAt } : { scheduled: false };
    }],
    ['fluxo_codex_settings', 'Ler ou ajustar como o ChatGPT trabalha aqui: model (id de um modelo disponível), effort (minimal|low|medium|high…), verbosity (low|medium|high). Sem argumentos, só lê; a leitura traz os modelos disponíveis. Conta, login e logout são da pessoa, em Configurações.', { model: opcional('string'), effort: opcional('string'), verbosity: opcional('string') }, async (input) => {
      if (!codexSettingsService) throw erro('codex_settings_unavailable', 'As configurações do Codex não estão disponíveis neste ambiente.');
      if (input.model === undefined && input.effort === undefined && input.verbosity === undefined) return { settings: await codexSettingsService.get(), models: await codexSettingsService.listModels?.() ?? [] };
      return { updated: true, settings: await codexSettingsService.update({ model: input.model, effort: input.effort, verbosity: input.verbosity }) };
    }],
    ['fluxo_export', 'Gerar arquivos locais: kind=evidence (pacote de auditoria da jornada atual, com caminho e sha256) ou kind=shareable (cópia do Fluxo sem dados pessoais). Nada sai do computador.', { kind: string }, async (input, runId) => {
      const tipo = String(input.kind);
      if (tipo === 'evidence') { if (!auditService) throw erro('export_unavailable', 'A auditoria não está disponível.'); return auditService.exportPackage({ runId }); }
      if (tipo === 'shareable') { if (!exportService) throw erro('export_unavailable', 'A exportação compartilhável não está disponível.'); return exportService.createShareableExport(); }
      throw erro('invalid_export_kind', 'kind deve ser evidence ou shareable.');
    }]
  ].map((entrada) => { entrada[2] = entrada[2] ?? lista; return entrada; });
}

function resumoDaCampanha(campanha, conhecidas = []) {
  const plataformas = (campanha.platforms ?? []).map((item) => ({ name: item.name, enabled: item.enabled === true, goal: Number(item.goal ?? 0) }));
  return {
    platforms: plataformas,
    availablePlatforms: conhecidas.map((item) => item.name),
    totalGoal: Number(campanha.totalGoal ?? 0),
    maxApplicationsPerRun: Number(campanha.maxApplicationsPerRun ?? 0),
    enabledCount: plataformas.filter((item) => item.enabled).length
  };
}

function erro(code, message) { return Object.assign(new Error(message), { code }); }
