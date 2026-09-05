// Construção de DOM sem innerHTML: conteúdo de vaga vem de página externa e
// nunca deve ser interpretado como marcação (fronteira de confiança).

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    // Estilo inline vai pelo CSSOM (a CSP não permite atributo style) e
    // dataset ignora valores ausentes em vez de gravar "undefined".
    else if (key === 'style') node.style.cssText = String(value);
    else if (key === 'dataset') { for (const [nome, item] of Object.entries(value ?? {})) if (item !== undefined && item !== null) node.dataset[nome] = String(item); }
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

// SVG inline precisa do espaço de nomes próprio; a CSP não permite data: URLs.
const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(tag, props = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    node.setAttribute(key, String(value));
  }
  return append(node, children);
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

// Linha de lista somente de leitura: mesmo desenho das linhas clicáveis, sem
// parecer clicável. `direita` recebe selos, apoio e ações.
export function staticListItem({ title, support, detail, right = [] }) {
  return el('li', {}, [
    el('div', { class: 'item-lista item-lista-estatico', role: 'none' }, [
      el('div', {}, [
        el('p', { class: 'item-titulo quebra', text: title }),
        support ? el('p', { class: 'item-apoio quebra', text: support }) : null,
        detail ? el('p', { class: 'apoio quebra', text: detail }) : null
      ]),
      el('div', { class: 'item-direita' }, right)
    ])
  ]);
}

// Cabeçalho de área: título, texto de abertura e conteúdo em coluna.
export function screen({ title, lead, children }) {
  return el('div', { class: 'area' }, [
    el('div', { class: 'area-titulo' }, [
      el('h1', { text: title }),
      lead ? el('p', { class: 'leitura secundario', text: lead }) : null
    ]),
    children
  ]);
}

export function badge(text, tone = '') {
  return el('span', { class: 'selo', text, dataset: tone ? { tom: tone } : {} });
}

// Todo botão com ação assíncrona fica ocupado até ela terminar: evita clique
// duplo, mostra progresso e nunca deixa uma falha sem aviso.
export function button(text, { variant = 'botao', onClick, ...props } = {}) {
  const classes = variant === 'primario' ? 'botao'
    : variant === 'secundario' ? 'botao botao-secundario'
    : variant === 'texto' ? 'botao botao-texto'
    : variant === 'perigo' ? 'botao botao-perigo'
    : 'botao';
  const node = el('button', { type: 'button', class: classes, text, ...props });
  if (onClick) {
    node.addEventListener('click', async (evento) => {
      let resultado;
      try { resultado = onClick(evento); } catch (error) { reportarFalha(error); return; }
      if (!(resultado instanceof Promise)) return;
      node.disabled = true;
      node.setAttribute('aria-busy', 'true');
      try { await resultado; } catch (error) { reportarFalha(error); } finally { node.disabled = false; node.removeAttribute('aria-busy'); }
    });
  }
  return node;
}

async function reportarFalha(error) {
  const { notice } = await import('../ui/messages.mjs');
  notice(error?.message ?? String(error), 'erro');
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

// Indicador numérico: rótulo, valor em destaque e apoio opcional.
export function metric(label, value, support) {
  return el('div', { class: 'bloco' }, [
    el('span', { class: 'etiqueta', text: label }),
    el('strong', { class: 'numero', text: value }),
    support ? el('span', { class: 'apoio', text: support }) : null
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

