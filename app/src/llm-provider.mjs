export const LLM_CONTRACT = { input: { task: 'string', input: 'safe context', instructions: 'optional string' }, output: { text: 'string', usage: 'optional usage metadata', model: 'optional model', fallback: 'optional boolean' } };

export function createLlmProvider({ config = {}, local, cloud } = {}) {
  const provider = String(config.modelProvider ?? 'local').toLowerCase();
  const cloudEnabled = config.cloudEnabled === true;
  return {
    async complete(input = {}) {
      if (provider === 'local' && local?.complete) return normalize(await local.complete(input), 'local');
      if (provider === 'cloud' && cloudEnabled && cloud?.complete) return normalize(await cloud.complete(input), 'cloud');
      if (local?.read) return { ...normalize(await local.read(input), 'local'), fallback: true, reason: 'modelo indisponível; leitura local utilizada' };
      return { text: '', model: 'none', fallback: true, offline: true, usage: {} };
    },
    status() { const available = provider === 'local' ? Boolean(local?.complete) : provider === 'cloud' && cloudEnabled ? Boolean(cloud?.complete) : Boolean(local?.read); return { provider, model: provider === 'local' ? String(config.localModel || 'local') : String(config.cloudModel || 'cloud'), cloudEnabled, available }; }
  };
}

function normalize(result, model) { return { text: String(result?.text ?? ''), usage: result?.usage ?? {}, model: result?.model ?? model, ...(result?.fallback ? { fallback: true } : {}) }; }
