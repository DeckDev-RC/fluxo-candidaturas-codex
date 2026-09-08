export function createObservability({ maxEntries = 100 } = {}) {
  const recent = [];
  let requests = 0;
  let errors = 0;
  return {
    record(entry) {
      requests += 1; if (Number(entry.status) >= 400) errors += 1;
      recent.push({ at: new Date().toISOString(), method: entry.method, path: entry.path, status: Number(entry.status), durationMs: Number(entry.durationMs) || 0 });
      while (recent.length > maxEntries) recent.shift();
    },
    snapshot() { return { requests, errors, recent: recent.map((entry) => ({ ...entry })) }; }
  };
}
