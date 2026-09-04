import { readFluxoState } from './state-reader.mjs';

export function createMetricsService({ rootDir, readOperations = async () => [] }) {
  return { async get() {
    const state = await readFluxoState(rootDir);
    const applications = state.applications.items;
    const confirmed = state.applications.confirmedCount;
    const assessments = applications.filter((item) => item.assessment).length;
    const withEvidence = applications.filter((item) => item.evidence || item.evidencePath || (Array.isArray(item.evidences) && item.evidences.length)).length;
    const failures = state.queue.items.reduce((total, item) => total + Number(item.failureCount ?? item.failures ?? 0), 0);
    const operations = await readOperations();
    const durations = operations.map((operation) => Date.parse(operation.finishedAt) - Date.parse(operation.startedAt)).filter((value) => Number.isFinite(value) && value >= 0);
    const failedOperations = operations.filter((operation) => operation.status === 'failed' || operation.status === 'needs_reconcile').length;
    const nextActions = applications.filter((item) => String(item.nextAction ?? '').trim()).length;
    const byPlatform = applications.reduce((result, item) => { const key = item.platform || 'sem plataforma'; result[key] = (result[key] ?? 0) + 1; return result; }, {});
    return { generatedAt: new Date().toISOString(), totals: { applications: applications.length, confirmed, queue: state.queue.items.length, blocked: state.queue.counts?.bloqueada ?? 0, failures, assessments, evidenceCoverage: applications.length ? Math.round(withEvidence * 100 / applications.length) : 0 }, rates: { failure: operations.length ? Math.round(failedOperations * 100 / operations.length) : 0, blocked: state.queue.items.length ? Math.round((state.queue.counts?.bloqueada ?? 0) * 100 / state.queue.items.length) : 0 }, timings: { averageOperationMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0 }, followUp: { nextActions }, byStatus: state.applications.counts, byPlatform, campaign: { totalGoal: state.campaign.totalGoal, dailyGoal: state.campaign.dailyGoal, weeklyGoal: state.campaign.weeklyGoal } };
  } };
}
