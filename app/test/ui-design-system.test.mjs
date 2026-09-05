import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

// Contrato dos tokens da direção Trajetória (U1-04): funções semânticas
// separadas da cor da marca e contraste medido, não estimado.

const arquivo = (nome) => readFile(new URL(`../public/styles/${nome}`, import.meta.url), 'utf8');

test('tokens definem cor, tipografia, espaçamento, borda, elevação e movimento', async () => {
  const css = await arquivo('tokens.css');
  for (const token of ['--mineral', '--tinta', '--terracota', '--fonte', '--e4', '--raio', '--elevacao-painel', '--duracao-curta', '--linha-controle']) {
    assert.match(css, new RegExp(`${token}:`), `token ${token} precisa existir`);
  }
  // Funções de risco têm cor própria: destaque da marca não substitui semântica.
  for (const token of ['--sucesso', '--atencao', '--erro', '--informacao', '--selecao']) {
    assert.match(css, new RegExp(`${token}:`), `função semântica ${token} precisa existir`);
  }
  assert.doesNotMatch(css, /--sucesso:\s*var\(--terracota\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /--duracao-curta:\s*0ms/, 'movimento reduzido precisa zerar a duração');
});

test('contraste dos pares principais atende WCAG 2.2 AA', async () => {
  const css = await arquivo('tokens.css');
  const cor = (nome) => {
    const encontrado = css.match(new RegExp(`${nome}:\\s*(#[0-9a-f]{6})`, 'i'));
    assert.ok(encontrado, `${nome} precisa ser uma cor hexadecimal`);
    return encontrado[1];
  };
  const mineral = cor('--mineral');
  const papel = cor('--papel');

  // Texto normal: 4,5:1. Bordas e componentes: 3:1.
  assert.ok(contraste(cor('--tinta'), mineral) >= 4.5, 'tinta sobre mineral');
  assert.ok(contraste(cor('--tinta-media'), mineral) >= 4.5, 'tinta média sobre mineral');
  assert.ok(contraste(cor('--terracota'), mineral) >= 4.5, 'terracota sobre mineral');
  assert.ok(contraste(papel, cor('--terracota')) >= 4.5, 'texto branco sobre terracota');
  for (const funcao of ['--sucesso', '--atencao', '--erro', '--informacao']) {
    assert.ok(contraste(cor(funcao), mineral) >= 4.5, `${funcao} sobre mineral`);
  }
  assert.ok(contraste(cor('--linha-controle'), papel) >= 3, 'borda de controle sobre papel');
});

test('componentes cobrem foco, erro, ocupado, indisponível e texto longo', async () => {
  const componentes = await arquivo('components.css');
  const base = await arquivo('base.css');
  assert.match(base, /:focus-visible/);
  assert.match(base, /\.pular-para-conteudo/);
  assert.match(base, /forced-colors/);
  assert.match(componentes, /\.campo\[data-erro="true"\]/);
  assert.match(componentes, /\.botao\[disabled\]/);
  assert.match(componentes, /\.botao\[aria-busy="true"\]/);
  assert.match(componentes, /\.ocupado/);
  assert.match(componentes, /\.item-lista\[aria-selected="true"\]/);
  assert.match(componentes, /\.selo\[data-tom="erro"\]/);
  assert.match(componentes, /dialog::backdrop/);
  assert.match(componentes, /\.aviso/);
  assert.match(base, /\.quebra\s*\{[^}]*overflow-wrap/);
});

test('a composição usa navegação compacta, lista com detalhe e adaptação de janela', async () => {
  const layout = await arquivo('layout.css');
  assert.match(layout, /\.navegacao/);
  assert.match(layout, /\.lista-detalhe/);
  assert.match(layout, /\.lista-detalhe\[data-detalhe="fechado"\]/);
  assert.match(layout, /@media \(max-width: 68rem\)/, 'janela estreita precisa transformar o detalhe em página');
  assert.match(layout, /@media \(max-width: 48rem\)/);
  assert.doesNotMatch(layout, /background-image:\s*(url|linear-gradient)/, 'a identidade não depende de foto ou gradiente');
});

test('a interface não carrega vocabulário de implementação nem texto de rascunho', async () => {
  const { readdir } = await import('node:fs/promises');
  const raiz = new URL('../public/', import.meta.url);
  const arquivos = [];
  const pendentes = [''];
  while (pendentes.length) {
    const pasta = pendentes.pop();
    for (const entrada of await readdir(new URL(pasta, raiz), { withFileTypes: true })) {
      if (entrada.name === 'fixtures') continue;
      const caminho = `${pasta}${entrada.name}`;
      if (entrada.isDirectory()) pendentes.push(`${caminho}/`);
      else if (/\.(mjs|js|html)$/.test(entrada.name)) arquivos.push(caminho);
    }
  }

  for (const caminho of arquivos) {
    const conteudo = await readFile(new URL(caminho, raiz), 'utf8');
    const texto = conteudo.replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(texto, /lorem ipsum|placeholder de|TODO:|FIXME/i, `${caminho} não pode conter texto de rascunho`);
    // Termos de implementação só são aceitos em detalhe de suporte, nunca no caminho principal.
    for (const termo of ['streaming', 'payload', 'claim', 'preflight']) {
      assert.doesNotMatch(texto, new RegExp(`text:\\s*['\`][^'\`]*\\b${termo}\\b`, 'i'), `${caminho} usa "${termo}" em texto visível`);
    }
  }
  assert.ok(arquivos.length >= 15, `a interface deve estar dividida em módulos; encontrados ${arquivos.length}`);
});

// Relação de contraste conforme WCAG 2.x.
function contraste(primeira, segunda) {
  const claro = Math.max(luminancia(primeira), luminancia(segunda));
  const escuro = Math.min(luminancia(primeira), luminancia(segunda));
  return (claro + 0.05) / (escuro + 0.05);
}

function luminancia(hex) {
  const canais = [1, 3, 5].map((indice) => Number.parseInt(hex.slice(indice, indice + 2), 16) / 255)
    .map((valor) => (valor <= 0.03928 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4));
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}
