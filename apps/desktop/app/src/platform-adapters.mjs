import { createPlaywrightDiscoveryAdapter } from './discovery-service.mjs';

export const PLATFORM_NAMES = ['GUPY', 'INFOJOBS', 'PANDAPE', 'LINKEDIN', 'CATHO', 'VAGASCOM', 'SOLIDES'];

// Shared observations are the fallback; platform-specific extraction can be injected without changing workflows.
export function createPlatformAdapters({ driver, parsers = {} }) {
  return Object.fromEntries(PLATFORM_NAMES.map(platform => [platform, {
    ...createPlaywrightDiscoveryAdapter({ driver, platform, ...(parsers[platform] ? { parse: parsers[platform] } : {}) }),
    async status(application) {
      if (!/^https?:\/\//i.test(application.identifierOrUrl ?? '')) throw failure('followup_url_required');
      await driver.goto(application.identifierOrUrl);
      const observed = await driver.snapshot();
      if (observed.challenge) throw failure('manual_intervention_required');
      if (!observed.applicationStatus) throw failure('followup_page_unsupported');
      return [{ type: observed.applicationStatus, status: observed.applicationStatus, note: observed.applicationStatusText, occurredAt: observed.observedAt, nextAction: 'Revisar o retorno observado na plataforma', source: observed.url }];
    }
  }]));
}
function failure(code) { return Object.assign(new Error('A página exige revisão manual antes de atualizar o acompanhamento.'), { code }); }
