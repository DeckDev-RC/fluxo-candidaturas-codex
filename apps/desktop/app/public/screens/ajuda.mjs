// Ajuda: o que o Fluxo faz, o que ele não promete e como resolver bloqueios.
// Fica em local previsível e também aparece no contexto da tarefa (U2-05).

import { button, el, panel, screen } from '../core/dom.mjs';
import { store } from '../core/store.mjs';
import { go } from '../core/router.mjs';

export function ajudaScreen() {
  return screen({ title: 'Como o Fluxo trabalha com você', children: [
    panel({
      title: 'O que ele faz sozinho',
      children: [
        el('ul', { class: 'leitura marcadores' }, [
          'Lê seu currículo, mostra o que entendeu e pergunta apenas o que faltar.',
          'Procura vagas nas plataformas que você habilitou, usando os seus critérios.',
          'Compara aderência, descarta duplicadas e explica por que recomendou cada vaga.',
          'Preenche o formulário só com informações que você confirmou.',
          'Para e chama você antes de enviar, aceitar declaração ou iniciar teste cronometrado.',
          'Acompanha as candidaturas e registra novidades no histórico.'
        ].map((item) => el('li', { class: 'quebra', text: item })))
      ]
    }),
    panel({
      title: 'O que ele não promete',
      children: [
        el('ul', { class: 'leitura marcadores' }, [
          'Não trabalha com o computador desligado nem com o aplicativo fechado.',
          'Não contorna CAPTCHA, verificação em duas etapas nem antiautomação.',
          'Não inventa experiência, resposta eliminatória ou dado pessoal.',
          'Não garante contratação nem estima probabilidade de sucesso.',
          'Não envia mensagem a recrutador nesta versão: apenas prepara rascunho.',
          'Nenhuma plataforma está certificada para envio totalmente automático nesta versão.'
        ].map((item) => el('li', { class: 'quebra', text: item })))
      ]
    }),
    panel({
      title: 'Atalhos do teclado',
      children: [
        el('ul', { class: 'leitura marcadores' }, [
          '"/" leva o cursor à conversa, de qualquer lugar da tela.',
          'Esc fecha o diálogo aberto; sem diálogo, volta à conversa.',
          'Ctrl + B recolhe ou mostra a navegação lateral.',
          'Tab percorre botões e listas; Enter abre o item selecionado.'
        ].map((item) => el('li', { class: 'quebra', text: item })))
      ]
    }),
    panel({
      title: 'Bloqueios comuns e o que fazer',
      children: [
        el('dl', { class: 'fatos' }, [
          ['A plataforma pediu CAPTCHA ou verificação em duas etapas', 'Conclua na janela do navegador que o Fluxo abriu. Depois volte: a tarefa retoma no ponto salvo. Nunca cole senha ou código na conversa.'],
          ['O envio ficou sem confirmação', 'Use "Conferir na plataforma". O Fluxo compara a página observada e não repete o clique.'],
          ['A automação de IA não conecta', 'Verifique o login em Configurações. Seus dados continuam acessíveis e você pode decidir e registrar sem a IA.'],
          ['Uma vaga não pode ser lida', 'A página pode ter mudado. O Fluxo marca a vaga como não suportada em vez de fingir que não há novidade.']
        ].flatMap(([termo, texto]) => [el('dt', { class: 'quebra', text: termo }), el('dd', { class: 'quebra', text: texto }), el('span', {})]))
      ]
    }),
    panel({
      title: 'Suporte e diagnóstico',
      children: [
        el('p', { class: 'leitura apoio', text: 'O pacote de suporte reúne informações técnicas sem senhas nem dados sensíveis, para você compartilhar quando pedir ajuda.' }),
        el('div', { class: 'linha-acoes' }, [
          button('Abrir cópias e exportação', { variant: 'secundario', onClick: () => { go('configuracoes'); requestAnimationFrame(() => document.querySelector('#painel-dados')?.scrollIntoView({ block: 'start' })); } })
        ]),
        el('details', { class: 'suporte' }, [
          el('summary', { text: 'Informações técnicas desta instalação' }),
          el('pre', { text: detalhesTecnicos() })
        ])
      ]
    })
  ] });
}

function detalhesTecnicos() {
  const estado = store.estado ?? {};
  return [
    `modo de IA: ${store.ia.modo || 'não determinado'}`,
    `ambiente pronto: ${estado.installation?.ready ? 'sim' : 'não'}`,
    `oportunidades na fila: ${(estado.queue?.items ?? []).length}`,
    `candidaturas registradas: ${(estado.applications?.items ?? []).length}`,
    `agenda ativa: ${store.agenda.length}`,
    `execução acompanhada: ${store.jornada.runId || 'nenhuma'}`
  ].join('\n');
}
