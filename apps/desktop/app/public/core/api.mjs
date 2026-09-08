// Acesso ao serviço local. Mensagens de erro chegam prontas para leitura humana:
// nenhuma tela mostra "algo deu errado" sem dizer o efeito e a ação possível.

let csrfToken = '';

const MENSAGENS = {
  approval_required: 'Esta ação precisa da sua aprovação antes de continuar.',
  approval_payload_changed: 'A revisão mudou depois da aprovação. Revise novamente antes de enviar.',
  manual_intervention_required: 'A plataforma pediu uma verificação humana. Conclua no navegador e volte.',
  submission_not_confirmed: 'A plataforma não confirmou o recebimento. Nada foi contado como enviado.',
  submission_needs_review: 'O resultado do envio ficou incerto. Confira a plataforma antes de tentar de novo.',
  checkpoint_mismatch: 'A tela aberta pertence a outra vaga ou etapa. Abra novamente a vaga correta.',
  unsupported_target_url: 'Só é possível abrir endereços da própria plataforma.',
  preflight_blocked: 'A preparação do ambiente precisa ser concluída antes desta ação.',
  platform_disabled: 'Esta plataforma não está habilitada na campanha. Ajuste em plataformas e metas.',
  agent_unavailable: 'A automação de IA não está disponível agora. Você continua podendo revisar seus dados.',
  runtime_probe_timeout: 'A automação de IA não respondeu no prazo.',
  campaign_platforms_required: 'Habilite ao menos uma plataforma antes de buscar.',
  local_auth_required: 'Esta janela não tem permissão para falar com o Fluxo local.',
  resume_content_required: 'Selecione um arquivo de currículo para importar.',
  resume_integrity_failed: 'O arquivo não passou na verificação de integridade. Nada foi importado.',
  resume_corrupt_or_empty: 'O arquivo está vazio ou incompleto. Nada foi importado.',
  unsupported_resume_format: 'Formatos aceitos: PDF, DOCX ou TXT.'
};

export function setCsrfToken(value) { csrfToken = String(value ?? ''); }

export function describeError(error) {
  const code = error?.code ?? '';
  return MENSAGENS[code] ?? error?.message ?? 'Não foi possível concluir a ação agora.';
}

export class FluxoError extends Error {
  constructor(message, code, status, cause) {
    super(message, cause ? { cause } : undefined);
    this.code = code;
    this.status = status;
  }
}

export async function read(path, { fallback } = {}) {
  try {
    const response = await pedir(path, { cache: 'no-store' });
    if (!response.ok) throw await toError(response);
    return await response.json();
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw error;
  }
}

export async function send(path, body = {}, { method = 'POST' } = {}) {
  const response = await pedir(path, {
    method,
    headers: { 'content-type': 'application/json', ...(csrfToken ? { 'x-fluxo-csrf': csrfToken } : {}) },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw await toError(response);
  const payload = await response.json().catch(() => ({}));
  return payload?.data ?? payload;
}

// Falha de rede vira mensagem da pessoa, não "Failed to fetch".
async function pedir(path, options) {
  try { return await fetch(path, options); }
  catch (error) { throw new FluxoError('O Fluxo local não respondeu. Verifique se o aplicativo continua aberto e tente de novo.', 'network_error', 0, error); }
}

async function toError(response) {
  const payload = await response.json().catch(() => ({}));
  const detail = payload.error ?? {};
  const code = detail.code ?? `http_${response.status}`;
  return new FluxoError(MENSAGENS[code] ?? detail.message ?? 'O Fluxo local recusou a ação.', code, response.status);
}

export async function bootstrapSession() {
  const session = await read('/api/v1/auth/session', { fallback: null });
  if (session?.csrfToken) setCsrfToken(session.csrfToken);
  return session;
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new FluxoError('Não foi possível ler o arquivo selecionado.', 'file_read_failed'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}
