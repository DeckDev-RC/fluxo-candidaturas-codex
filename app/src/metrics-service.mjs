import { readFluxoState } from './state-reader.mjs';
import { openAuthoritativePersistence } from './persistence-authority.mjs';

export function createMetricsService({ rootDir, persistence = openAuthoritativePersistence({ rootDir }), readOperations = async () => [], readRuns = async () => [], readExceptions = async () => [], readTraces = async () => [] }) {
  return { async get() {
    const state = await readFluxoState(rootDir, { persistence });
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
    const [runs, exceptions, traces] = await Promise.all([readRuns(), readExceptions(), readTraces()]);
    const start = (run) => Date.parse(run.startedAt); const firstResult = (run) => Date.parse(run.firstResultAt ?? run.finishedAt); const succeeded = runs.filter((run) => run.status === 'succeeded');
    const latencies = succeeded.map((run) => firstResult(run) - start(run)).filter(Number.isFinite).filter((value) => value >= 0);
    const qualityValues = traces.map((trace) => Number(trace.quality ?? trace.qualityScore)).filter(Number.isFinite);
    return { generatedAt: new Date().toISOString(), totals: { applications: applications.length, confirmed, queue: state.queue.items.length, blocked: state.queue.counts?.bloqueada ?? 0, failures, assessments, evidenceCoverage: applications.length ? Math.round(withEvidence * 100 / applications.length) : 0 }, rates: { failure: operations.length ? Math.round(failedOperations * 100 / operations.length) : 0, blocked: state.queue.items.length ? Math.round((state.queue.counts?.bloqueada ?? 0) * 100 / state.queue.items.length) : 0 }, timings: { averageOperationMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0 }, autopilot: { intentToFirstResultMs: latencies.length ? Math.min(...latencies) : 0, timeToFirstConfirmedApplicationMs: succeeded.length ? Math.min(...succeeded.map((run) => Date.parse(run.finishedAt) - start(run)).filter((value) => value >= 0)) : 0, interventions: exceptions.length, retries: traces.filter((trace) => trace.retry === true).length, duplicates: traces.filter((trace) => trace.duplicate === true).length, reconciliations: traces.filter((trace) => trace.reconciliation === true).length, qualityScore: qualityValues.length ? Math.round(qualityValues.reduce((sum, value) => sum + value, 0) / qualityValues.length) : 0, autonomousCompletionRate: runs.length ? Math.round(succeeded.length * 100 / runs.length) : 0 }, followUp: { nextActions }, byStatus: state.applications.counts, byPlatform, campaign: { totalGoal: state.campaign.totalGoal, dailyGoal: state.campaign.dailyGoal, weeklyGoal: state.campaign.weeklyGoal } };
  } };
}
