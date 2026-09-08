function parseConversationProvider(content = '', fallback = 'skynet') {
  let value = fallback;
  for (const line of String(content).split(/\r?\n/)) {
    const match = line.match(/^\s*CONVERSATION_PROVIDER\s*=\s*(.*?)\s*$/i);
    if (!match) continue;
    const raw = match[1].replace(/^(['"])(.*)\1$/, '$2').trim().toLowerCase();
    if (raw) value = raw;
  }
  return value;
}

module.exports = { parseConversationProvider };
