// Construção de DOM sem innerHTML: conteúdo de vaga vem de página externa e
// nunca deve ser interpretado como marcação (fronteira de confiança).

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'onClick') node.addEventListener('click', value);
    else if (key === 'onSubmit') node.addEventListener('submit', value);
    else if (key === 'onInput') node.addEventListener('input', value);
    else if (key === 'onChange') node.addEventListener('change', value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, String(value));
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  for (const child of [children].flat(4)) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function replace(node, children) {
  node.replaceChildren();
  return append(node, children);
}

export function field({ label, help, error, control }) {
  return el('label', { class: 'campo', dataset: { erro: error ? 'true' : 'false' } }, [
    el('span', { text: label }),
    control,
    help && el('span', { class: 'ajuda', text: help }),
    error && el('span', { class: 'campo-erro', text: error })
  ]);
}

export function input(props = {}) {
  return el('input', { type: 'text', ...props });
}

export function badge(text, tone = '') {
  return el('span', { class: 'selo', text, dataset: tone ? { tom: tone } : {} });
}

export function button(text, { variant = 'botao', ...props } = {}) {
  const classes = variant === 'primario' ? 'botao'
    : variant === 'secundario' ? 'botao botao-secundario'
    : variant === 'texto' ? 'botao botao-texto'
    : variant === 'perigo' ? 'botao botao-perigo'
    : 'botao';
  return el('button', { type: 'button', class: classes, text, ...props });
}

export function panel({ title, kicker, actions, children, id }) {
  return el('section', { class: 'painel', id }, [
    (title || kicker || actions) && el('div', { class: 'painel-cabecalho' }, [
      el('div', {}, [
        kicker && el('p', { class: 'etiqueta', text: kicker }),
        title && el('h2', { text: title })
      ]),
      actions && el('div', { class: 'linha-acoes' }, actions)
    ]),
    children
  ]);
}

export function emptyState(title, explanation, action) {
  return el('div', { class: 'vazio' }, [
    el('p', { class: 'item-titulo', text: title }),
    el('p', { class: 'leitura', text: explanation }),
    action
  ]);
}

export function definitions(rows) {
  return el('dl', { class: 'fatos' }, rows.flatMap(([term, value, extra]) => [
    el('dt', { text: term }),
    el('dd', { class: 'quebra', text: value ?? 'não informado' }),
    extra ?? el('span', {})
  ]));
}

export function busy(text) {
  return el('span', { class: 'ocupado', text });
}
