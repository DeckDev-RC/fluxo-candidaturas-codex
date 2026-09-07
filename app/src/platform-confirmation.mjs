const NEGATIVE = /\b(nao|não|not|never|failed|falhou|erro|error|já enviada|ja enviada|already applied)\b/i;
const CONDITIONAL = /\b(quando|será enviada|sera enviada|will be|if you|caso você)\b/i;
// "Você se candidatou à vaga X" é a confirmação da InfoJobs (mapeada em conta real, 07/09/2026).
const POSITIVE = /(?:sua |your )?(?:candidatura|application)\s+(?:(?:foi|was|has been)\s+)?(?:enviada|recebida|realizada|efetuada|conclu[íi]da|submitted|received)\b|\bvoc[êe] se candidatou\b/i;
const PREVIOUS = /voc[êe] j[áa] se candidatou|j[áa] (?:est[áa] )?candidatad[oa]|already applied/i;

export function inspectConfirmation({ text = '', observedJob = '', expectedJob = '', previousApplication = false } = {}) {
  const body = String(text);
  if (previousApplication || PREVIOUS.test(body)) return block('previous_application', 'Já existe candidatura antiga para esta vaga.');
  if (expectedJob && observedJob && normalize(expectedJob) !== normalize(observedJob)) {
    return block('wrong_job', 'A confirmação observada é de outra vaga, inclusive com a mesma URL.');
  }
  if (NEGATIVE.test(body)) return block('negative', 'A página mostrou uma negativa ou candidatura já existente.');
  if (CONDITIONAL.test(body) && !POSITIVE.test(body)) return block('conditional', 'A mensagem é condicional e não confirma o envio.');
  if (POSITIVE.test(body)) return { ok: true, kind: 'confirmed' };
  return block('unconfirmed', 'Não há evidência atual da candidatura correta.');
}

function block(kind, message) { return { ok: false, kind, message }; }
function normalize(value) { return String(value).replace(/\/+$/, '').toLowerCase(); }
