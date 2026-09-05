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
