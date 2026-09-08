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
// Só uma linha nova (ou o indicador de resposta) pede rolagem para o fim; ao
// abrir a tela, a fala atual no topo é o que a pessoa deve ver primeiro.
let pendenteRolagem = false;

export function transcript() {
  if (!mensagens) mensagens = carregar();
  return mensagens;
}

export function onTranscript(listener) {
  ouvintes.add(listener);
  return () => ouvintes.delete(listener);
}

// Fala do Fluxo. Repetição imediata do mesmo texto não vira nova linha.
export function say(texto, { tom = 'informacao', emAndamento = false } = {}) {
  return registrar({ autor: 'fluxo', texto: String(texto ?? '').trim(), tom, ...(emAndamento ? { emAndamento: true } : {}) });
}

// Passo do agente: "Abrindo o InfoJobs…" vira "InfoJobs aberto" na mesma linha,
// em vez de duas linhas por ferramenta. O passo em andamento mostra o tempo
// decorrido; ao concluir, fica registrado quanto levou.
export function amendStep(texto, { tom = 'passo' } = {}) {
  const lista = transcript();
  const ultimo = lista.at(-1);
  if (ultimo?.autor === 'fluxo' && ultimo.tom === 'passo' && String(texto ?? '').trim()) {
    ultimo.texto = String(texto).trim();
    ultimo.tom = tom;
    if (ultimo.emAndamento) { ultimo.emAndamento = false; ultimo.duracaoMs = Math.max(0, Date.now() - Date.parse(ultimo.em)); }
    persistir();
    avisar();
    return ultimo;
  }
  return say(texto, { tom });
}

// Fala da IA no meio do turno ("Vou abrir o LinkedIn agora.") seguida de uma
// ferramenta é narração, não resposta: vira parte do bloco de atividade, para a
// mesma ação não aparecer como três mensagens separadas.
export function demoteToStep(registro) {
  if (!registro || !transcript().includes(registro) || registro.tom === 'passo') return;
  registro.tom = 'passo';
  registro.narracao = true;
  registro.duracaoMs = 0;
  persistir();
  avisar();
}

// Um turno que termina (ou falha) não deixa passo "em andamento" para trás.
export function settleSteps() {
  let mudou = false;
  for (const item of transcript()) if (item.emAndamento) { item.emAndamento = false; mudou = true; }
  if (mudou) { persistir(); avisar(); }
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

// Indicador "pensando" enquanto um turno da IA está em curso.
let pensando = false;
export function isThinking() { return pensando; }
export function setThinking(valor) {
  pensando = Boolean(valor);
  pendenteRolagem = true;
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
    // Um passo "em andamento" de uma sessão anterior já não está: o app recarregou.
    return Array.isArray(salvo) ? salvo.filter((item) => item?.texto && item?.autor).map((item) => (item.emAndamento ? { ...item, emAndamento: false } : item)) : [];
  } catch { return []; }
}

function persistir() {
  try { window.localStorage.setItem(CHAVE(), JSON.stringify(mensagens)); } catch {}
}

function avisar() {
  for (const listener of ouvintes) {
    try { listener(mensagens); } catch (error) { console.error('ouvinte da conversa falhou', error); }
  }
}
