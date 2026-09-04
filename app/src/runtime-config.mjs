import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULTS = {
  requireFinalConfirmation: true,
  allowAutomatedSubmission: false,
  browserAutomationRequired: true,
  playwrightSession: 'candidaturas',
  playwrightHeadless: false,
  maxApplicationsPerRun: 30,
  maxConsecutiveFailures: 3,
  checkpointAfterEachAction: true,
  evidenceMode: 'confirmation'
};

const FIELDS = {
  REQUIRE_FINAL_CONFIRMATION: ['requireFinalConfirmation', 'boolean'],
  ALLOW_AUTOMATED_SUBMISSION: ['allowAutomatedSubmission', 'boolean'],
  BROWSER_AUTOMATION_REQUIRED: ['browserAutomationRequired', 'boolean'],
  PLAYWRIGHT_SESSION: ['playwrightSession', 'string'],
  PLAYWRIGHT_HEADLESS: ['playwrightHeadless', 'boolean'],
  MAX_APPLICATIONS_PER_RUN: ['maxApplicationsPerRun', 'integer'],
  MAX_CONSECUTIVE_FAILURES: ['maxConsecutiveFailures', 'integer'],
  CHECKPOINT_AFTER_EACH_ACTION: ['checkpointAfterEachAction', 'boolean'],
  EVIDENCE_MODE: ['evidenceMode', 'string']
};

export async function readRuntimeConfig(rootDir) {
  let content = '';
  try {
    content = await readFile(join(rootDir, '.env'), 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const values = { ...DEFAULTS };
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || !FIELDS[match[1]]) continue;
    const [property, type] = FIELDS[match[1]];
    const raw = match[2].replace(/^(['"])(.*)\1$/, '$2');
    if (type === 'boolean' && /^(true|false)$/i.test(raw)) values[property] = raw.toLowerCase() === 'true';
    if (type === 'integer' && /^\d+$/.test(raw)) values[property] = Number(raw);
    if (type === 'string' && raw) values[property] = raw;
  }
  return values;
}
