import { readFluxoState } from './state-reader.mjs';

export function createMetricsService({ rootDir }) {
  return { async get() {
    const state = await readFluxoState(rootDir);
    const applications = state.applications.items;
    const confirmed = state.applications.confirmedCount;
    const assessments = applications.filter((item) => item.assessment).length;
    const withEvidence = applications.filter((item) => item.evidence || item.evidencePath || (Array.isArray(item.evidences) && item.evidences.length)).length;
    const failures = state.queue.items.reduce((total, item) => total + Number(item.failureCount ?? item.failures ?? 0), 0);
    const byPlatform = applications.reduce((result, item) => { const key = item.platform || 'sem plataforma'; result[key] = (result[key] ?? 0) + 1; return result; }, {});
    return { generatedAt: new Date().toISOString(), totals: { applications: applications.length, confirmed, queue: state.queue.items.length, blocked: state.queue.counts?.bloqueada ?? 0, failures, assessments, evidenceCoverage: applications.length ? Math.round(withEvidence * 100 / applications.length) : 0 }, byStatus: state.applications.counts, byPlatform, campaign: { totalGoal: state.campaign.totalGoal, dailyGoal: state.campaign.dailyGoal, weeklyGoal: state.campaign.weeklyGoal } };
  } };
}
