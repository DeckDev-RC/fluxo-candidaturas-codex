import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

// A auditoria do checklist encontrou sete casos do mesmo padrão: módulo correto,
// teste passando e nenhum fio ligando um ao outro. Este teste transforma esse
// padrão em falha: código de produção alcançado apenas por teste é código morto.

const FONTE = new URL('../src/', import.meta.url);
const PUBLICO = new URL('../public/', import.meta.url);

// Entradas do processo: ninguém dentro de src/ importa quem inicia o processo.
const PONTOS_DE_ENTRADA = new Set(['main.mjs', 'runtime-server.mjs']);

test('nenhum módulo de produção é alcançado apenas por teste', async () => {
  const modulos = await listar(FONTE, /\.mjs$/);
  const importadores = new Map(modulos.map((nome) => [nome, new Set()]));

  for (const nome of modulos) {
    const conteudo = await readFile(new URL(nome, FONTE), 'utf8');
    for (const [, referencia] of conteudo.matchAll(/from '(\.[\w./-]+)'/g)) {
      const alvo = resolver(nome, referencia);
      if (importadores.has(alvo)) importadores.get(alvo).add(nome);
    }
  }

  const orfaos = modulos.filter((nome) => !PONTOS_DE_ENTRADA.has(nome) && importadores.get(nome).size === 0).sort();
  assert.deepEqual(orfaos, [], `módulo sem importador de produção (código morto ou fio faltando): ${orfaos.join(', ')}`);
  assert.ok(modulos.length >= 40, `a composição deve estar modular; módulos: ${modulos.length}`);
});

test('nenhuma exportação de produção existe apenas para o teste chamá-la', async () => {
  const modulos = await listar(FONTE, /\.mjs$/);
  const fontes = new Map();
  for (const nome of modulos) fontes.set(nome, await readFile(new URL(nome, FONTE), 'utf8'));

  const semUso = [];
  for (const [nome, conteudo] of fontes) {
    const outros = [...fontes].filter(([outro]) => outro !== nome).map(([, texto]) => texto).join('\n');
    const declaracoes = [
      ...conteudo.matchAll(/export (?:async )?function ([A-Za-z_$][\w$]*)/g),
      ...conteudo.matchAll(/export const ([A-Z][A-Z0-9_]*)/g)
    ];
    for (const [declaracao, exportado] of declaracoes) {
      const padrao = new RegExp(`\\b${exportado}\\b`);
      // Uso no próprio arquivo conta: exportar demais é excesso, não código morto.
      if (padrao.test(conteudo.replace(declaracao, ''))) continue;
      if (padrao.test(outros)) continue;
      semUso.push(`${nome}:${exportado}`);
    }
  }

  assert.deepEqual(semUso.sort(), [], `exportação sem uso em produção (chamada só por teste?): ${semUso.join(', ')}`);
});

test('nenhum módulo da interface fica fora do grafo carregado pela página', async () => {
  const modulos = await listar(PUBLICO, /\.(mjs|js)$/);
  // Raízes: o módulo principal e os scripts comuns que a página carrega no <head>.
  const pagina = await readFile(new URL('index.html', PUBLICO), 'utf8');
  const raizes = ['app.js', ...[...pagina.matchAll(/<script src="\/([\w./-]+\.js)"/g)].map(([, nome]) => nome)];
  const alcancados = new Set(raizes);
  const pendentes = [...raizes];
  while (pendentes.length) {
    const atual = pendentes.pop();
    const conteudo = await readFile(new URL(atual, PUBLICO), 'utf8');
    for (const [, referencia] of conteudo.matchAll(/from '(\.[\w./-]+)'/g)) {
      const alvo = resolver(atual, referencia);
      if (!alcancados.has(alvo)) { alcancados.add(alvo); pendentes.push(alvo); }
    }
  }

  const soltos = modulos.filter((nome) => !alcancados.has(nome)).sort();
  assert.deepEqual(soltos, [], `módulo de interface não carregado por ninguém: ${soltos.join(', ')}`);
});

test('toda rota chamada pela interface existe no servidor', async () => {
  // As rotas vivem no servidor e nos grupos de rota; as com parâmetro são expressões
  // regulares, então comparo sem as escapas.
  const arquivosDeRota = ['http-server.mjs', 'final-release-routes.mjs', ...(await listar(FONTE, /\.mjs$/)).filter((nome) => nome.startsWith('routes/'))];
  const servidor = (await Promise.all(arquivosDeRota.map((nome) => readFile(new URL(nome, FONTE), 'utf8')))).join('\n').replaceAll('\\', '');

  const rotas = new Set();
  for (const nome of await listar(PUBLICO, /\.(mjs|js)$/)) {
    const conteudo = await readFile(new URL(nome, PUBLICO), 'utf8');
    for (const [, rota] of conteudo.matchAll(/['"`](\/api\/v1\/[\w/-]+)/g)) rotas.add(rota.replace(/\/$/, ''));
  }

  const ausentes = [...rotas].filter((rota) => {
    if (servidor.includes(`'${rota}'`)) return false;
    // Rotas com parâmetro aparecem como expressão regular: comparo o prefixo declarado.
    const prefixo = rota.split('/').slice(0, 4).join('/');
    return !servidor.includes(prefixo);
  }).sort();

  assert.deepEqual(ausentes, [], `a interface chama rota inexistente: ${ausentes.join(', ')}`);
  assert.ok(rotas.size >= 20, `a interface precisa consumir o contrato real; rotas encontradas: ${rotas.size}`);
});

async function listar(base, filtro, prefixo = '') {
  const encontrados = [];
  for (const entrada of await readdir(new URL(prefixo, base), { withFileTypes: true })) {
    const caminho = `${prefixo}${entrada.name}`;
    if (entrada.isDirectory()) {
      if (entrada.name === 'fixtures') continue;
      encontrados.push(...await listar(base, filtro, `${caminho}/`));
    } else if (filtro.test(entrada.name)) {
      encontrados.push(caminho);
    }
  }
  return encontrados;
}

function resolver(origem, referencia) {
  const pilha = origem.includes('/') ? origem.split('/').slice(0, -1) : [];
  for (const parte of referencia.split('/')) {
    if (parte === '.' || parte === '') continue;
    if (parte === '..') pilha.pop();
    else pilha.push(parte);
  }
  return pilha.join('/');
}
