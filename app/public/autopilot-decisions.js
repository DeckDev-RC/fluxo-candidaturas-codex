// Caixa de decisões do Autopilot: quando um especialista para em `waiting_user`,
// a pessoa responde a lacuna aqui e a jornada continua de onde parou.
export function mountAutopilotDecisions({ mutationHeaders, onContinued } = {}) {
  const container = document.querySelector('#autopilot-decisions');
  if (!container) return { update() {} };
  const title = container.querySelector('p');
  const form = container.querySelector('#autopilot-answers-form');
  const fields = container.querySelector('#autopilot-answers-fields');
  const feedback = container.querySelector('#autopilot-answers-feedback');
  const submit = container.querySelector('#autopilot-answers-submit');
  let runId = '';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const answers = collectAnswers(form);
    if (!Object.keys(answers).length) { feedback.textContent = 'Responda ao menos uma pergunta para continuar.'; return; }
    submit.disabled = true;
    feedback.textContent = 'Gravando a resposta e retomando a jornada…';
    try {
      await post('/api/v1/memory/answers', { answers }, mutationHeaders);
      const result = await post(`/api/v1/autopilot/${encodeURIComponent(runId)}/continue`, { answers }, mutationHeaders);
      feedback.textContent = result.message ?? 'Jornada retomada com a sua resposta.';
      onContinued?.(result);
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });

  return {
    update(result = {}) {
      runId = result.run?.id ?? runId;
      const questions = pendingQuestions(result);
      container.hidden = !questions.length;
      if (!questions.length) { fields.replaceChildren(); return; }
      title.textContent = result.message ?? 'A IA precisa de uma informação para continuar.';
      fields.replaceChildren(...questions.map(field));
      feedback.textContent = '';
    }
  };
}

function pendingQuestions(result) {
  if (result.status !== 'waiting_user') return [];
  const questions = result.result?.questions ?? result.result?.preview?.questions ?? [];
  return Array.isArray(questions) ? questions.filter((item) => item?.key) : [];
}

function field(question) {
  const label = document.createElement('label');
  label.textContent = question.prompt ?? `Qual é o valor de ${question.key}?`;
  const input = document.createElement('input');
  input.name = question.key;
  input.required = question.required === true;
  label.append(input);
  return label;
}

function collectAnswers(form) {
  return Object.fromEntries([...new FormData(form).entries()]
    .map(([key, value]) => [key, String(value).trim()])
    .filter(([, value]) => value));
}

async function post(url, body, mutationHeaders) {
  const response = await fetch(url, { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message ?? 'Não foi possível registrar a resposta agora.');
  return payload.data ?? payload;
}
