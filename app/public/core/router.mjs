// Rotas por endereço: abrir por link, atualizar a página e voltar/avançar
// devolvem a pessoa ao mesmo contexto, sem criar segunda execução (U2-06).

const rolagem = new Map();
let rotas = {};
let atual = '';
let aoTrocar = () => {};

export const ROTAS = ['agora', 'oportunidades', 'candidaturas', 'perfil', 'decisoes', 'configuracoes', 'ajuda', 'primeiro-uso'];

export function startRouter({ routes, onChange }) {
  rotas = routes;
  aoTrocar = onChange ?? aoTrocar;
  window.addEventListener('hashchange', () => aplicar());
  aplicar();
}

export function currentRoute() { return atual; }

export function go(rota, parametros = {}) {
  const consulta = new URLSearchParams(parametros).toString();
  window.location.hash = `#${rota}${consulta ? `?${consulta}` : ''}`;
}

export function routeParams() {
  const [, consulta = ''] = window.location.hash.replace(/^#/, '').split('?');
  return Object.fromEntries(new URLSearchParams(consulta));
}

export function rerender() { aplicar({ preservarRolagem: true }); }

function aplicar({ preservarRolagem = false } = {}) {
  const [nome = ''] = window.location.hash.replace(/^#/, '').split('?');
  const rota = ROTAS.includes(nome) ? nome : 'agora';
  // A área de trabalho tem rolagem própria: a posição de leitura é dela.
  const area = document.querySelector('#conteudo');
  if (!preservarRolagem && atual && atual !== rota) rolagem.set(atual, area?.scrollTop ?? 0);
  atual = rota;
  marcarNavegacao(rota);
  const posicao = preservarRolagem ? area?.scrollTop ?? 0 : rolagem.get(rota) ?? 0;
  document.querySelector('#tela').replaceChildren(rotas[rota]?.(routeParams()) ?? document.createTextNode(''));
  if (area) area.scrollTop = posicao;
  aoTrocar(rota);
}

function marcarNavegacao(rota) {
  for (const link of document.querySelectorAll('[data-rota]')) {
    const ativo = link.dataset.rota === rota;
    if (ativo) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}
