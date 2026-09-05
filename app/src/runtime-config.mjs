import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PLATFORM_NAMES } from './platform-adapters.mjs';

const DEFAULTS = {
  requireFinalConfirmation: true,
  allowAutomatedSubmission: false,
  browserAutomationRequired: true,
  playwrightSession: 'candidaturas',
  playwrightHeadless: false,
  maxApplicationsPerRun: 30,
  maxConsecutiveFailures: 3,
  maxTaskAttempts: 2,
  maxRunDurationMs: 14400000,
  maxRunTokens: 200000,
  followUpMinIntervalMs: 1800000,
  checkpointAfterEachAction: true,
  evidenceMode: 'confirmation',
  modelProvider: 'local',
  localModel: '',
  cloudEnabled: false,
  cloudModel: '',
  authMode: 'chatgpt',
  codexCommand: ''
};

const FIELDS = {
  REQUIRE_FINAL_CONFIRMATION: ['requireFinalConfirmation', 'boolean'],
  ALLOW_AUTOMATED_SUBMISSION: ['allowAutomatedSubmission', 'boolean'],
  BROWSER_AUTOMATION_REQUIRED: ['browserAutomationRequired', 'boolean'],
  PLAYWRIGHT_SESSION: ['playwrightSession', 'string'],
  PLAYWRIGHT_HEADLESS: ['playwrightHeadless', 'boolean'],
  MAX_APPLICATIONS_PER_RUN: ['maxApplicationsPerRun', 'integer'],
  MAX_CONSECUTIVE_FAILURES: ['maxConsecutiveFailures', 'integer'],
  MAX_TASK_ATTEMPTS: ['maxTaskAttempts', 'integer'],
  MAX_RUN_DURATION_MS: ['maxRunDurationMs', 'integer'],
  MAX_RUN_TOKENS: ['maxRunTokens', 'integer'],
  FOLLOW_UP_MIN_INTERVAL_MS: ['followUpMinIntervalMs', 'integer'],
  CHECKPOINT_AFTER_EACH_ACTION: ['checkpointAfterEachAction', 'boolean'],
  EVIDENCE_MODE: ['evidenceMode', 'string'],
  MODEL_PROVIDER: ['modelProvider', 'string'],
  LOCAL_MODEL: ['localModel', 'string'],
  CLOUD_ENABLED: ['cloudEnabled', 'boolean'],
  CLOUD_MODEL: ['cloudModel', 'string'],
  AUTH_MODE: ['authMode', 'string'],
  CODEX_COMMAND: ['codexCommand', 'string']
};

export async function readRuntimeConfig(rootDir) {
  let content = '';
  try {
    content = await readFile(join(rootDir, '.env'), 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const values = { ...DEFAULTS, platformUrls: {} };
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const raw = match[2].replace(/^(['"])(.*)\1$/, '$2');
    const platform = match[1].match(/^([A-Z0-9]+)_URL$/)?.[1];
    if (platform && PLATFORM_NAMES.includes(platform)) {
      if (raw) values.platformUrls[platform] = raw;
      continue;
    }
    if (!FIELDS[match[1]]) continue;
    const [property, type] = FIELDS[match[1]];
    if (type === 'boolean' && /^(true|false)$/i.test(raw)) values[property] = raw.toLowerCase() === 'true';
    if (type === 'integer' && /^\d+$/.test(raw)) values[property] = Number(raw);
    if (type === 'string' && raw) values[property] = raw;
  }
  return values;
}
