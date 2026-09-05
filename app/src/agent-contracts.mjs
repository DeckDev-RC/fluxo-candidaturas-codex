export const AGENT_CONTRACTS = {
  intake: { input: { objective: true, memory: true }, output: { facts: true, questions: true, confirmed: true }, tools: ['file', 'app-server'] },
  discovery: { input: { criteria: true, memory: true }, output: { opportunities: true, source: true, collectedAt: true }, tools: ['playwright', 'api', 'fixture'] },
  fit: { input: { opportunities: true, facts: true }, output: { shortlist: true, score: true, explanation: true }, tools: ['script', 'app-server'] },
  application: { input: { opportunity: true, memory: true }, output: { status: true, evidence: true, confirmed: true }, tools: ['playwright', 'fixture'] },
  followup: { input: { applications: true, instruction: false }, output: { events: true, alerts: true, nextActions: true }, tools: ['app-server', 'playwright', 'api', 'fixture'] }
};

export function chooseAgentTool(agent, available = {}) {
  const contract = AGENT_CONTRACTS[agent];
  if (!contract) throw domainError('unknown_agent', `Agente desconhecido: ${agent}`);
  const preferred = agent === 'intake' ? ['file', 'app-server'] : agent === 'fit' ? ['script', 'app-server'] : agent === 'application' ? ['playwright', 'fixture'] : agent === 'discovery' ? ['playwright', 'api', 'fixture'] : agent === 'followup' ? ['app-server', 'playwright', 'api', 'fixture'] : contract.tools;
  return preferred.find((tool) => available[tool] === true || tool === 'app-server' && (available.appServer === true || available['app-server'] === true)) ?? (available.fixture === true ? 'fixture' : contract.tools.at(-1));
}

function domainError(code, message) { const error = new Error(message); error.code = code; return error; }
