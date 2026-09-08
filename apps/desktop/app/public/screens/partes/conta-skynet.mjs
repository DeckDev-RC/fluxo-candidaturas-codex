import { badge, button, el, panel } from '../../core/dom.mjs';
import { loadAiStatus, store } from '../../core/store.mjs';
import { loginSkynet, logoutSkynet } from '../../core/skynet.mjs';
import { notice } from '../../ui/messages.mjs';
import { openDialog } from '../../ui/dialog.mjs';
import { rerender } from '../../core/router.mjs';

export function skynetPanel() {
  const connected = store.ia.provedores?.skynet?.available === true;
  const consented = store.ia.consentimentos?.skynet?.accepted === true;
  return panel({
    kicker: 'conta de conversa',
    title: 'SkynetChat',
    id: 'painel-skynet',
    actions: [
      store.ia.provedor === 'skynet' ? badge('IA ativa', 'informacao') : null,
      badge(!consented ? 'privacidade pendente' : connected ? 'conectado' : 'login necessário', connected && consented ? 'sucesso' : 'atencao')
    ],
    children: [
      el('p', { class: 'leitura secundario', text: connected
        ? 'O SkynetChat responde nesta conversa. A sessão fica isolada no navegador do aplicativo.'
        : 'O código é digitado somente na janela oficial do SkynetChat e nunca passa pela conversa do Fluxo.' }),
      el('p', { class: 'apoio', text: 'Suas mensagens e o contexto confirmado necessário para responder são enviados diretamente ao SkynetChat; cookies e código de acesso permanecem na partição isolada do navegador.' }),
      el('p', { class: 'apoio', text: 'O Skynet responde em texto; quando um pedido exige navegador ou alteração no app, o Fluxo o encaminha ao ChatGPT/Codex conectado.' }),
      el('div', { class: 'linha-acoes' }, [
        !consented ? privacyButton() : connected ? button('Sair do SkynetChat', { variant: 'texto', onClick: confirmarSaida }) : loginButton(),
        button('Verificar conexão', { variant: 'secundario', onClick: async () => { await loadAiStatus(); rerender(); } })
      ])
    ]
  });
}

function loginButton() {
  const control = button('Entrar no SkynetChat', {
    id: 'entrar-skynet',
    onClick: async () => {
      control.disabled = true;
      control.textContent = 'Abrindo o login…';
      try {
        await loginSkynet();
        notice('Digite seu código na janela oficial do SkynetChat. O Fluxo retomará quando o login for confirmado.', 'informacao');
      } catch (error) {
        notice(error.message, 'erro');
      } finally {
        control.disabled = false;
        control.textContent = 'Entrar no SkynetChat';
      }
    }
  });
  return control;
}

function privacyButton() {
  return button('Revisar e autorizar SkynetChat', {
    id: 'entrar-skynet',
    onClick: () => openDialog({
      title: 'Antes de usar o SkynetChat',
      body: [
        el('p', { class: 'leitura', text: 'O Fluxo envia diretamente ao SkynetChat o texto que você escrever, um resumo dos fatos profissionais confirmados e até 24 mensagens recentes para manter o contexto.' }),
        el('p', { class: 'apoio', text: 'Não são enviados: código de acesso, cookies, senhas, tokens, histórico do navegador ou arquivos locais não anexados por você.' }),
        el('p', { class: 'apoio', text: 'A resposta e a retenção no serviço externo seguem os termos do SkynetChat. Você pode sair da conta e limpar a conversa nas Configurações.' })
      ],
      actions: [
        { label: 'Cancelar' },
        { label: 'Entendi e quero continuar', onSelect: async () => {
          try {
            await loginSkynet();
            await loadAiStatus();
            notice('Digite seu código na janela oficial do SkynetChat. O Fluxo retomará quando o login for confirmado.', 'informacao');
            rerender();
          } catch (error) {
            notice(error.message, 'erro');
            return false;
          }
          return true;
        } }
      ]
    })
  });
}

function confirmarSaida() {
  openDialog({
    title: 'Sair do SkynetChat',
    body: [el('p', { class: 'leitura', text: 'A conversa textual ficará indisponível até você entrar novamente. Nenhum dado do perfil ou candidatura será apagado.' })],
    actions: [
      { label: 'Cancelar' },
      { label: 'Sair da conta', variant: 'perigo', onSelect: async () => {
        try {
          await logoutSkynet();
          await loadAiStatus();
          notice('Sessão do SkynetChat removida.', 'atencao');
          rerender();
        } catch (error) {
          notice(error.message, 'erro');
          return false;
        }
        return true;
      } }
    ]
  });
}
