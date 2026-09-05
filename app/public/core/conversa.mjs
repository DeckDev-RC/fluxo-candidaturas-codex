// Transcrição da conversa: o que o Fluxo disse, o que a pessoa pediu e quando.
// É um registro legível, não a fonte de verdade: a situação atual vem sempre do
// estado persistido pelo serviço local (agora-estados.mjs), nunca do histórico.

import { decisions, isDemo, store, subscribe } from './store.mjs';
import { onNotice } from '../ui/messages.mjs';
import { resolveNowState, TEXTOS } from '../screens/agora-estados.mjs';

const LIMITE = 80;
// A chave vem da URL, não do estado carregado: a transcrição pode começar antes.
const CHAVE = () => `fluxo-conversa${isDemo() ? ':demo' : ''}`;
const SAUDACAO = 'Olá! Eu sou o Fluxo. Conto aqui o que estou fazendo, registro cada resultado e peço sua decisão quando ela depender de você. Pode escrever a qualquer momento.';

const ouvintes = new Set();
const vistas = new WeakSet();
let mensagens = null;
let ultimaSituacao = '';
let pendenteRolagem = true;

export function transcript() {
  if (!mensagens) mensagens = carregar();
  return mensagens;
}

export function onTranscript(listener) {
  ouvintes.add(listener);
  return () => ouvintes.delete(listener);
}

// Fala do Fluxo. Repetição imediata do mesmo texto não vira nova linha.
export function say(texto, { tom = 'informacao' } = {}) {
  return registrar({ autor: 'fluxo', texto: String(texto ?? '').trim(), tom });
}

// Pedido da pessoa, sempre registrado como veio.
export function ask(texto) {
  return registrar({ autor: 'voce', texto: String(texto ?? '').trim(), tom: '' });
}

export function clearTranscript() {
  mensagens = [];
  persistir();
  avisar();
}

// A tela pede rolagem para o fim só quando há linha nova.
export function takeScrollRequest() {
  const pedido = pendenteRolagem;
  pendenteRolagem = false;
  return pedido;
}

// Chamar antes do primeiro aviso: tudo o que o Fluxo diz passa pela conversa.
export function startTranscript() {
  transcript();
  if (!mensagens.length) say(SAUDACAO);
  onNotice((texto, tom) => say(texto, { tom }));
  subscribe(espelharEstado);
}

function registrar(mensagem) {
  if (!mensagem.texto) return null;
  const lista = transcript();
  const anterior = lista.at(-1);
  if (anterior && anterior.autor === mensagem.autor && anterior.texto === mensagem.texto) return anterior;
  const registro = { ...mensagem, em: new Date().toISOString() };
  lista.push(registro);
  while (lista.length > LIMITE) lista.shift();
  pendenteRolagem = true;
  persistir();
  avisar();
  return registro;
}

// Cada atualização da jornada e cada mudança de situação vira uma linha.
function espelharEstado() {
  for (const item of store.jornada?.atualizacoes ?? []) {
    if (vistas.has(item)) continue;
    vistas.add(item);
    say(item.texto, { tom: item.tom ?? 'informacao' });
  }
  if (store.carregando || !store.estado) return;
  const { estado } = resolveNowState({ estado: store.estado, jornada: store.jornada, decisoes: decisions(), perfil: store.perfil, ia: store.ia });
  if (estado !== ultimaSituacao) {
    if (ultimaSituacao) say(TEXTOS[estado]?.titulo ?? estado, { tom: tomDaSituacao(estado) });
    ultimaSituacao = estado;
  }
}

function tomDaSituacao(estado) {
  if (['decisao-pendente', 'envio-incerto', 'pausada'].includes(estado)) return 'atencao';
  if (['acesso-indisponivel', 'preparar-ambiente'].includes(estado)) return 'erro';
  if (['campanha-concluida', 'pronta-para-buscar'].includes(estado)) return 'sucesso';
  return 'informacao';
}

function carregar() {
  try {
    const salvo = JSON.parse(window.localStorage.getItem(CHAVE()) ?? '[]');
    return Array.isArray(salvo) ? salvo.filter((item) => item?.texto && item?.autor) : [];
  } catch { return []; }
}

function persistir() {
  try { window.localStorage.setItem(CHAVE(), JSON.stringify(mensagens)); } catch {}
}

function avisar() {
  for (const listener of ouvintes) listener(mensagens);
}
