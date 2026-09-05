import test from 'node:test';
import assert from 'node:assert/strict';
import { ESTADOS, resolveNowState } from '../public/screens/agora-estados.mjs';

// A tela Agora precisa priorizar pelo estado persistido, não pelo último texto
// do chat. Cada caso aqui corresponde a uma linha da seção 5 do checklist de UX.

const perfilPronto = { profile: { exists: true } };

function base(patch = {}) {
  return {
    estado: {
      installation: { ready: true },
      campaign: { totalGoal: 3, platforms: [{ name: 'INFOJOBS', enabled: true }] },
      memory: { facts: { name: confirmado('Pessoa'), email: confirmado('p@example.test'), targetRoles: confirmado('Dados') }, resumes: [{ selected: true, sha256: 'abc' }] },
      queue: { items: [{ id: '1', status: 'na fila' }] },
      applications: { items: [], confirmedCount: 0 },
      discovery: { collectedAt: '2026-09-05T00:00:00.000Z', opportunities: [{}] },
      exceptions: []
    },
    perfil: perfilPronto,
    ia: { disponivel: true },
    jornada: {},
    decisoes: [],
    ...patch
  };
}

function confirmado(value) { return { value, confirmed: true }; }

test('sem perfil, plataforma ou fato confirmado a tela pede o começo', () => {
  const semPerfilNemFato = base();
  semPerfilNemFato.estado.memory.facts = {};
  assert.equal(resolveNowState({ ...semPerfilNemFato, perfil: null }).estado, 'primeiro-uso');
  const semPlataforma = base();
  semPlataforma.estado.campaign.platforms = [];
  assert.equal(resolveNowState(semPlataforma).estado, 'primeiro-uso');
  const semFato = base();
  semFato.estado.memory.facts = {};
  assert.equal(resolveNowState(semFato).estado, 'primeiro-uso');
});

test('decisão pendente vence trabalho em andamento', () => {
  const situacao = resolveNowState(base({ jornada: { status: 'trabalhando' }, decisoes: [{ tipo: 'aprovacao' }] }));
  assert.equal(situacao.estado, 'decisao-pendente');
  assert.equal(situacao.quantidade, 1);
});

test('envio incerto aparece antes de qualquer outro andamento', () => {
  assert.equal(resolveNowState(base({ jornada: { status: 'incerto' } })).estado, 'envio-incerto');
});

test('IA indisponível durante a jornada explica a capacidade afetada', () => {
  const situacao = resolveNowState(base({ jornada: { status: 'trabalhando' }, ia: { disponivel: false, mensagem: 'App Server ausente.' } }));
  assert.equal(situacao.estado, 'acesso-indisponivel');
  assert.equal(situacao.motivo, 'App Server ausente.');
});

test('IA indisponível sem jornada não bloqueia a tela', () => {
  assert.equal(resolveNowState(base({ ia: { disponivel: false } })).estado, 'pronta-para-buscar');
});

test('pausa do usuário não é tratada como erro', () => {
  const situacao = resolveNowState(base({ jornada: { status: 'pausada', mensagem: 'Pausado por você.' } }));
  assert.equal(situacao.estado, 'pausada');
});

test('currículo sem leitura concluída não anuncia perfil entendido', () => {
  const dados = base();
  dados.estado.memory.resumes = [{ selected: true }];
  dados.estado.memory.facts = { name: confirmado('Pessoa'), targetRoles: confirmado('Dados') };
  assert.equal(resolveNowState(dados).estado, 'material-nao-lido');
});

test('trabalho em andamento mostra a tarefa observável', () => {
  const situacao = resolveNowState(base({ jornada: { status: 'trabalhando', mensagem: 'Comparando aderência.' } }));
  assert.equal(situacao.estado, 'trabalhando');
  assert.equal(situacao.motivo, 'Comparando aderência.');
});

test('meta atingida separa fim da busca de fim dos processos', () => {
  const dados = base();
  dados.estado.applications = { items: [{ status: 'triagem' }], confirmedCount: 3 };
  assert.equal(resolveNowState(dados).estado, 'campanha-concluida');
});

test('busca sem resultado explica critérios em vez de prometer vaga', () => {
  const dados = base();
  dados.estado.queue = { items: [{ id: '1', status: 'processada' }] };
  assert.equal(resolveNowState(dados).estado, 'sem-vaga-adequada');
});

test('ambiente com pendência aparece antes de convidar para buscar', () => {
  const dados = base();
  dados.estado.installation = { ready: false };
  dados.estado.discovery = {};
  assert.equal(resolveNowState(dados).estado, 'preparar-ambiente');
});

test('tudo confirmado convida para a busca', () => {
  const dados = base();
  dados.estado.discovery = {};
  assert.equal(resolveNowState(dados).estado, 'pronta-para-buscar');
});

test('todos os estados declarados têm resolução possível', () => {
  assert.equal(ESTADOS.length, 13);
  assert.equal(new Set(ESTADOS).size, 13);
});

// Achado da auditoria real: quem passou pelo cartão de primeiro uso (fatos
// confirmados e plataformas) não tem perfil/candidato.md e voltava ao cartão.
test('fatos confirmados e plataformas bastam para sair do primeiro uso, mesmo sem arquivo de perfil', () => {
  const dados = base({ perfil: { profile: { exists: false } }, jornada: { status: 'trabalhando', mensagem: 'Buscando.' } });
  assert.equal(resolveNowState(dados).estado, 'trabalhando');
});

// A IA condutora encerra o turno quando a etapa depende da pessoa (login,
// verificação, escolha): a tela diz isso em vez de "estou trabalhando".
test('turno encerrado esperando a pessoa vira "preciso de você", acima de pausa e trabalho', () => {
  const situacao = resolveNowState(base({ jornada: { status: 'aguardando', mensagem: 'Entre no LinkedIn na janela do navegador.' } }));
  assert.equal(situacao.estado, 'aguardando-voce');
  assert.equal(situacao.motivo, 'Entre no LinkedIn na janela do navegador.');
});

// Achado do QA: a jornada parava na revisão humana e a tela dizia "estou
// trabalhando", sem dizer que a pessoa precisava escolher uma vaga.
test('jornada parada sem pergunta nem aprovação, com vagas na fila, pede a escolha da vaga', () => {
  const dados = {
    perfil: { profile: { exists: true } },
    ia: { disponivel: true },
    estado: {
      installation: { ready: true },
      campaign: { platforms: [{ name: 'INFOJOBS', enabled: true }], totalGoal: 10 },
      memory: { facts: { name: { confirmed: true }, targetRoles: { confirmed: true }, location: { confirmed: true } }, resumes: [] },
      queue: { items: [{ id: 'q1', status: 'na fila', fitScore: 80 }] },
      applications: { items: [], confirmedCount: 0 }
    },
    jornada: { status: 'decisao', perguntas: [], mensagem: 'Revisão humana obrigatória antes do envio.' }
  };
  const resolvido = resolveNowState(dados);
  assert.equal(resolvido.estado, 'escolher-vaga');
  assert.equal(resolvido.quantidade, 1);
  // Com pergunta aberta, a lacuna vem antes da escolha.
  assert.equal(resolveNowState({ ...dados, jornada: { ...dados.jornada, perguntas: [{ key: 'x' }] }, decisoes: [{ tipo: 'informacao' }] }).estado, 'decisao-pendente');
  // Sem vaga disponível, a jornada parada continua descrita como trabalho em curso.
  assert.equal(resolveNowState({ ...dados, estado: { ...dados.estado, queue: { items: [] } } }).estado, 'trabalhando');
});
