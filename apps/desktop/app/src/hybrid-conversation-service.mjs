import { classificarRoteamento } from './conversation-intent.mjs';

const MAX_EVENTS = 200;

export function createHybridConversationService({
  textual,
  operational,
  providerService,
  skynetAuthService,
  codexAuthService,
  classify = classificarRoteamento,
  now = () => new Date()
} = {}) {
  if (!textual?.turn || !operational?.turn || !providerService?.get) throw new TypeError('A conversa híbrida requer os dois provedores.');
  const listeners = new Set();
  const events = [];
  let sequence = 0;
  let active = null;
  let lastRoute = 'textual';
  let codexWaiting = false;
  let suppressReset = false;

  const unsubscribeTextual = textual.subscribe((event) => forward(event, 'skynet', 'textual'));
  const unsubscribeOperational = operational.subscribe((event) => forward(event, 'codex', 'operational'));

  return {
    async turn(text, { system = false } = {}) {
      if (busy()) throw domainError('conversation_busy', 'O Fluxo ainda está respondendo. Aguarde ou interrompa.');
      const selected = providerService.get();
      const decision = selected === 'codex'
        ? { route: 'operational', reason: 'selected-codex' }
        : classify(text, { ultimoTurnoOperacional: lastRoute === 'operational', aguardandoCodex: codexWaiting, system });
      const provider = decision.route === 'operational' ? 'codex' : 'skynet';
      const target = provider === 'codex' ? operational : textual;
      const reservation = { provider, route: decision.route, delegated: false };
      active = reservation;
      try {
        await requireAuth(provider);
        if (active !== reservation) throw domainError('conversation_interrupted', 'Interrompido por você.');
        reservation.delegated = true;
        const result = await target.turn(text, { system });
        return { ...result, provider, route: decision.route, reason: decision.reason };
      } catch (error) {
        if (active === reservation) active = null;
        throw error;
      }
    },

    async interrupt() {
      const current = active;
      if (!current) {
        if (operational.status().busy) return operational.interrupt();
        if (textual.status().busy) return textual.interrupt();
        return { interrupted: false };
      }
      if (!current.delegated) { active = null; return { interrupted: true }; }
      return (current.provider === 'codex' ? operational : textual).interrupt();
    },

    async reset() {
      suppressReset = true;
      let results;
      try {
        results = await Promise.allSettled([
          Promise.resolve().then(() => textual.reset()),
          Promise.resolve().then(() => operational.reset())
        ]);
      }
      finally { suppressReset = false; }
      const failed = results.find((result) => result.status === 'rejected');
      if (failed) throw failed.reason;
      active = null;
      lastRoute = 'textual';
      codexWaiting = false;
      emit('conversation.reset', { provider: 'hybrid', route: 'system' });
      return { reset: true };
    },

    async resetProvider(provider) {
      const target = provider === 'codex' ? operational : textual;
      suppressReset = true;
      try { await target.reset(); }
      finally { suppressReset = false; }
      if (active?.provider === provider) active = null;
      if (provider === 'skynet') lastRoute = 'textual';
      return { reset: true, provider };
    },

    async selectProvider(provider) {
      if (busy()) throw domainError('conversation_busy', 'Aguarde o turno atual terminar antes de trocar a IA.');
      return providerService.set(provider);
    },

    handleNotification(message) { return operational.handleNotification?.(message) ?? false; },
    handleToolCall(call) { return operational.handleToolCall?.(call) ?? false; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    history() { return [...events]; },
    status() {
      const current = active ?? (operational.status().busy ? { provider: 'codex', route: 'operational' } : textual.status().busy ? { provider: 'skynet', route: 'textual' } : null);
      const target = current?.provider === 'codex' ? operational.status() : current?.provider === 'skynet' ? textual.status() : {};
      return {
        ...target,
        busy: busy(),
        provider: 'hybrid',
        activeProvider: providerService.get(),
        turnProvider: current?.provider ?? '',
        route: current?.route ?? ''
      };
    },
    close() { unsubscribeTextual(); unsubscribeOperational(); }
  };

  function busy() {
    return Boolean(active) || operational.status().busy === true || textual.status().busy === true;
  }

  async function requireAuth(provider) {
    if (provider === 'skynet' && providerService.hasConsent && !providerService.hasConsent('skynet')) {
      throw domainError('provider_consent_required', 'Revise e aceite o envio de dados ao SkynetChat em Configurações.');
    }
    const status = await (provider === 'codex' ? codexAuthService?.status?.() : skynetAuthService?.status?.());
    const authenticated = status?.authenticated === true || status?.signedIn === true || ['authenticated', 'signed_in'].includes(String(status?.status ?? status?.state));
    if (authenticated) return;
    throw provider === 'codex'
      ? domainError('codex_signed_out', 'Entre com ChatGPT/Codex em Configurações para eu operar o navegador.')
      : domainError('skynet_signed_out', 'Entre no SkynetChat em Configurações para continuar a conversa.');
  }

  function forward(event, provider, route) {
    if (suppressReset && event.type === 'conversation.reset') return;
    if (provider === 'codex' && event.type === 'waiting_user') codexWaiting = true;
    if (provider === 'codex' && event.type === 'waiting_resolved') codexWaiting = false;
    if (event.type === 'turn.started' && !active) active = { provider, route, delegated: true };
    if (event.type === 'turn.completed' || event.type === 'turn.failed') {
      lastRoute = route;
      if (active?.provider === provider) active = null;
    }
    emit(event.type, { ...event, id: undefined, provider, route });
  }

  function emit(type, payload) {
    const event = { ...payload, id: `hybrid-${Date.now()}-${sequence++}`, type, at: payload.at ?? now().toISOString() };
    events.push(event);
    while (events.length > MAX_EVENTS) events.shift();
    for (const listener of listeners) {
      try { listener(event); } catch { /* observador não interrompe o roteamento */ }
    }
  }
}

function domainError(code, message) { return Object.assign(new Error(message), { code }); }
