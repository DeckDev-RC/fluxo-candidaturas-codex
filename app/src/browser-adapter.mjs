import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectConfirmation } from './platform-confirmation.mjs';
import { detectUnsupportedPage } from './unsupported-page.mjs';
import { assertTrustedPage } from './trust-boundary.mjs';

const SENSITIVE_KEY = /(password|token|cookie|secret|mfa|authorization|credential)/i;

export function createBrowserAdapter({ driver, evidenceRoot = '' }) {
  let lastSnapshot = null;

  return {
    async assertContext(snapshot = {}, item = {}) {
      const current = await this.snapshot();
      const identity = String(current.jobUrl || current.jobId || '');
      const expected = String(item.identifierOrUrl || '');
      if (snapshot.url && current.url !== snapshot.url || identity && expected && !(identity === expected || expected.replace(/\/$/, '').endsWith('/' + identity))) throw domainError('checkpoint_mismatch', 'A página atual pertence a outra vaga ou etapa. Abra novamente a vaga correta.');
      return current;
    },
    async validatePrepared(snapshot = {}) {
      const current = await this.snapshot();
      if (snapshot.url && current.url !== snapshot.url || snapshot.formHash && current.formHash !== snapshot.formHash) throw domainError('approval_payload_changed', 'O formulário mudou desde a revisão. Revise novamente antes do envio.');
    },
    // Abre a página de entrada da plataforma na própria aba e informa se a
    // pessoa precisa entrar. Desafio (CAPTCHA/MFA) não é erro aqui: é informação
    // para a IA pedir a intervenção certa.
    async openPlatform(platform, url) {
      if (!driver.openPlatform) throw domainError('browser_platform_unsupported', 'Este navegador não abre plataformas em abas separadas.');
      if (!/^https?:\/\//i.test(String(url))) throw domainError('unsupported_target_url', 'A plataforma não tem página de entrada conhecida.');
      return driver.openPlatform(platform, url);
    },
    async tabs() { return driver.tabs ? driver.tabs() : []; },
    // Navegação livre na aba da plataforma. Desafio na tela para a ação e vira
    // pedido à pessoa; texto lido passa pela fronteira de confiança.
    async observe(platform, opcoes = {}) {
      if (!driver.observe) throw domainError('browser_platform_unsupported', 'Este navegador não permite navegação livre.');
      const observado = await driver.observe(platform, opcoes);
      await pararEmDesafio(driver, platform);
      assertTrustedPage({ text: observado.snapshot ?? observado.text });
      return observado;
    },
    async readText(platform, opcoes = {}) {
      if (!driver.readText) throw domainError('browser_platform_unsupported', 'Este navegador não permite navegação livre.');
      const lido = await driver.readText(platform, opcoes);
      await pararEmDesafio(driver, platform);
      assertTrustedPage({ text: lido.text });
      return lido;
    },
    async act(platform, acao = {}) {
      if (!driver.act) throw domainError('browser_platform_unsupported', 'Este navegador não permite navegação livre.');
      await pararEmDesafio(driver, platform);
      const resultado = await driver.act(platform, acao);
      await pararEmDesafio(driver, platform);
      assertTrustedPage({ text: resultado.snapshot ?? resultado.text });
      return resultado;
    },
    async loginState(platform) { return driver.loginState ? driver.loginState(platform) : { open: false }; },
    activePlatform() { return driver.activePlatform ? driver.activePlatform() : ''; },
    // Abre a página da vaga e lê descrição e requisitos; desafio (CAPTCHA/login) para aqui.
    async readJob(item) {
      const target = String(item?.identifierOrUrl ?? '');
      if (!/^https?:\/\//i.test(target)) throw domainError('unsupported_target_url', 'Só leio endereços http(s) da plataforma.');
      if (driver.goto) await driver.goto(target);
      const estado = await driver.snapshot();
      if (estado?.challenge) throw manualIntervention(estado.challenge);
      assertTrustedPage(estado ?? {});
      if (!driver.readJobPage) return { url: target, description: String(estado?.text ?? '').slice(0, 6000), requirements: [], eliminators: [], workMode: '', salary: '' };
      return driver.readJobPage();
    },
    async open(item) {
      const target = String(item?.identifierOrUrl ?? '');
      // Recusar esquema não suportado em vez de fotografar a página que já estava aberta.
      if (target && !/^https?:\/\//i.test(target)) {
        throw domainError('unsupported_target_url', 'Só abro endereços http(s) da plataforma. Revise o identificador da vaga.');
      }
      if (driver.goto && target) await driver.goto(target);
      return this.snapshot();
    },
    async snapshot() {
      const state = await driver.snapshot();
      if (state?.challenge) throw manualIntervention(state.challenge);
      // Toda página lida passa pela fronteira de confiança: conteúdo de vaga não
      // concede permissão, não instrui shell e não aprova pela pessoa.
      assertTrustedPage(state ?? {});
      lastSnapshot = redact(state);
      return lastSnapshot;
    },

    async fill(field, value) {
      if (!lastSnapshot) throw domainError('snapshot_required', 'Capture um snapshot antes de preencher.');
      await driver.fill(field, value);
      const state = await driver.snapshot();
      if (state?.challenge) throw manualIntervention(state.challenge);
      lastSnapshot = redact(state);
    },

    async observeForm() {
      const observed = await this.snapshot();
      // Página sem formulário reconhecível pausa a capacidade em vez de inventar campos.
      const unsupported = detectUnsupportedPage(observed, { capability: 'preenchimento de formulário' });
      if (unsupported) throw unsupported;
      // `fieldDetails` traz referência, rótulo e tipo de cada controle observado;
      // `fields` é só a lista de referências. O controlador precisa do tipo.
      return {
        ...observed,
        fields: observed?.fieldDetails ?? observed?.dom?.fields ?? observed?.fields ?? [],
        visual: observed?.screenshot ?? observed?.visual ?? null
      };
    },

    async fillConfirmed(facts = {}) {
      const knownFields = new Set(lastSnapshot?.dom?.fields ?? lastSnapshot?.fields ?? Object.keys(facts));
      for (const [field, fact] of Object.entries(facts)) {
        if (fact?.confirmed !== true || !knownFields.has(field)) continue;
        await this.fill(field, fact.value);
      }
      return lastSnapshot;
    },

    async submitWithRetry(ref, { expected = {} } = {}) {
      if (!lastSnapshot) await this.snapshot();
      const before = await this.verifySubmission(expected);
      if (before.confirmed) return { ...before, attempts: 0 };
      try { await driver.click(ref); }
      catch (error) {
        const observed = await this.verifySubmission(expected);
        if (observed.confirmed) return { ...observed, attempts: 1 };
        throw domainError('submission_not_confirmed', 'O clique teve resultado incerto; reconciliação necessária.');
      }
      // Plataformas de um clique confirmam com atraso curto e às vezes abrem um
      // convite (Premium) por cima: espera a confirmação e só depois fecha o convite.
      if (driver.awaitConfirmation) await driver.awaitConfirmation().catch(() => null);
      const confirmation = await this.verifySubmission(expected);
      if (confirmation.confirmed) { if (driver.dismissOverlay) await driver.dismissOverlay().catch(() => null); return { ...confirmation, attempts: 1 }; }
      throw domainError('submission_not_confirmed', 'Resultado do envio incerto. Reconcilie a tela antes de qualquer nova tentativa.');
    },

    // A leitura da confirmação é do inspetor de plataforma: uma única regra decide
    // positivo, negativo, condicional, vaga errada e candidatura anterior.
    async verifySubmission(expected = {}) {
      const state = redact(await driver.state());
      if (state?.challenge) throw manualIntervention(state.challenge);
      lastSnapshot = state;
      const identity = String(expected.identifierOrUrl ?? expected.jobId ?? '');
      const observedIdentity = String(state.jobUrl || state.jobId || '');
      const inspection = inspectConfirmation({
        text: String(state?.confirmationText ?? state?.text ?? ''),
        // O inspetor compara identidade quando a plataforma expõe a vaga observada.
        expectedJob: observedIdentity && identity ? finalSegment(identity) : '',
        observedJob: observedIdentity && identity ? finalSegment(observedIdentity) : '',
        previousApplication: state?.previousApplication === true
      });
      return {
        confirmed: inspection.ok === true,
        kind: inspection.kind,
        reason: inspection.ok === true ? '' : inspection.message,
        confirmedAt: inspection.ok === true ? new Date().toISOString() : null,
        state
      };
    },

    async captureEvidence({ runId = 'run' } = {}) {
      const safeId = String(runId).replace(/[^a-zA-Z0-9_-]/g, '_');
      const path = `evidencias/${safeId}-confirmacao.png`;
      if (typeof driver.screenshot !== 'function') throw domainError('evidence_capture_unavailable', 'O driver não oferece captura de evidência.');
      const result = await driver.screenshot(path);
      if (result?.ok === false || result?.exitCode != null && result.exitCode !== 0) throw domainError('evidence_capture_failed', 'Não foi possível capturar a evidência.');
      if (evidenceRoot) { try { await access(join(evidenceRoot, path)); } catch { throw domainError('evidence_capture_missing', 'A captura não produziu um arquivo verificável.'); } }
      return path;
    },

    async reconcile(checkpoint = {}) {
      const state = redact(await driver.state());
      if (state?.challenge) throw manualIntervention(state.challenge);
      const differences = [];
      for (const field of ['url', 'page']) if (checkpoint[field] && (field !== 'url' || /^https?:\/\//i.test(String(checkpoint[field]))) && state[field] !== checkpoint[field]) differences.push({ field, expected: checkpoint[field], observed: state[field] ?? '' });
      return { matches: differences.length === 0, requiresReview: differences.length > 0, differences, state };
    }
  };
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !SENSITIVE_KEY.test(key)).map(([key, entry]) => [key, redact(entry)]));
}

function finalSegment(value) {
  return String(value).replace(/\/+$/, '').split('/').at(-1);
}

// CAPTCHA/MFA na aba: a IA não contorna; a pessoa resolve e a IA continua.
async function pararEmDesafio(driver, platform) {
  if (!driver.loginState) return;
  const estado = await driver.loginState(platform).catch(() => null);
  if (estado?.challenge) throw manualIntervention(estado.challenge);
}

function manualIntervention(challenge) {
  return domainError('manual_intervention_required', `Intervenção manual necessária: ${challenge}`);
}

function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
