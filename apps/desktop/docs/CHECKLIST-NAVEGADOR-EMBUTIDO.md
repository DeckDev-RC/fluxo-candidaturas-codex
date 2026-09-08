# Checklist — navegador embutido na janela do Fluxo

Objetivo: em vez de abrir um Chromium separado, a IA opera as plataformas
(LinkedIn, InfoJobs, Gupy…) em **abas dentro da própria janela do app**, ao lado
da conversa. A pessoa vê a página real, entra com a conta ali mesmo quando a IA
pede, e o "Já entrei" acontece no mesmo lugar.

## Decisões técnicas (pesquisa de 05/09/2026)

| Tema | Decisão | Por quê |
|---|---|---|
| Como embutir | `WebContentsView` do Electron (uma por plataforma) sobre a coluna de acompanhamento da janela principal | API recomendada pelo Electron; `BrowserView` está obsoleta e `<webview>` é desencorajada |
| Como a IA opera as abas | Playwright `chromium.connectOverCDP` no Chromium do próprio Electron, com `--remote-debugging-port=0` (porta aleatória, só loopback) e endpoint lido de `DevToolsActivePort` em `userData` | Reaproveita o driver atual (snapshot, preencher, clicar, evidência) quase sem mudança; `WebContentsView` aparece como página CDP |
| Como o driver acha a aba certa | O processo principal abre a aba carregando uma URL marcadora do backend (`/aba/<PLATAFORMA>`); o driver procura a página com essa URL e só então navega para a plataforma | Id de `webContents` ≠ id de alvo CDP; a URL é o elo estável |
| Sessão das abas | Sessão padrão do app (persistente em `userData`), sem partição própria | Login das plataformas persiste entre execuções; uma partição `persist:` cria outro contexto CDP que o `connectOverCDP` do Playwright não enxerga como contexto separado |
| Sem Electron (`npm run start:web`, testes, e2e) | Caminho atual: Playwright lança o Chromium próprio | O embutido é um modo do driver, não uma troca de arquitetura para todos os cenários |
| Sem `DevToolsActivePort` (ex.: Electron lançado por outro depurador) | O app segue com o Chromium separado e a interface avisa | Degradação explícita, sem quebra |
| Segurança | A porta de depuração fica só em `127.0.0.1`, aleatória, ativa enquanto o app roda; abas sem `preload`, `sandbox`, `contextIsolation`, permissões negadas, popups abrem na própria aba | Risco aceito e documentado: um processo local malicioso poderia falar com a porta; equivalente ao que um Chrome com depuração remota expõe |

Fluxo de mensagens:

```
renderer (UI)  ──IPC──▶ main: área da aba (retângulo), mostrar, esconder, listar
main ──webContents.send──▶ renderer: lista de abas mudou
worker (backend) ──parentPort──▶ main: abrir aba (plataforma, URL marcadora), mostrar, listar
main ──parentPort──▶ worker: resposta (id)
worker: Playwright connectOverCDP(endpoint) ──▶ páginas do Electron (abas)
```

## Fase 0 — Contrato

- [x] Este checklist versionado, revisado antes da implementação.

## Fase 1 — Processo principal (Electron)

- [x] `desktop/main.cjs`: `remote-debugging-port=0` antes do `ready`; leitura de
      `DevToolsActivePort` (com espera curta) → endpoint passado ao worker por argumento.
- [x] `desktop/abas.cjs`: gerenciador de abas (`abrir`, `mostrar`, `esconder`,
      `definirArea`, `listar`, `fechar`), uma `WebContentsView` por plataforma,
      só uma visível, posicionada no retângulo informado pela interface; oculta
      quando a área é `null` (rota diferente, diálogo aberto, fora da vista).
- [x] Abas endurecidas: sem preload, `sandbox`, `contextIsolation`, permissões
      negadas, popup abre na mesma aba, título/URL enviados à interface a cada mudança.
- [x] IPC do renderer (`fluxo:abas-*`) com a mesma checagem de origem das outras
      chamadas; preload expõe `fluxoDesktop.abas`.
- [x] Mensagens do worker (`abas`) com id de correlação e resposta; `fluxo:workspace`
      informa `embutido: true/false`.

## Fase 2 — Backend

- [x] `createLocalRuntime`/`createRuntimeServer` aceitam `browserHost`
      (`cdpEndpoint`, `openTab`, `showTab`, `hideTab`, `markerUrl`).
- [x] Driver em modo hospedado: `connectOverCDP`, `pageFor(plataforma)` pela URL
      marcadora, aba genérica `FLUXO` para páginas fora do catálogo, `openPlatform`
      mostra a aba em vez de `bringToFront`, `close` só desconecta.
- [x] Rotas: `GET /aba/:plataforma` (página marcadora), `GET /api/v1/browser/tabs`,
      `POST /api/v1/browser/open { platform }` (a pessoa abre/mostra uma aba pela interface).
- [x] `backend-worker.mjs`: recebe o endpoint, implementa `browserHost` sobre o
      `parentPort` e monta a URL marcadora com a porta real do servidor.

## Fase 3 — Interface

- [x] `navegador-embutido.mjs`: faixa de abas (plataformas habilitadas e abas
      abertas, com estado conectado / login pendente / verificação) e área do
      navegador; informa o retângulo ao processo principal (ResizeObserver, scroll,
      redimensionamento) e `null` quando some da vista, muda de rota ou abre diálogo.
- [x] Acompanhamento usa o embutido quando disponível; senão, mantém a lista atual.
- [x] Coluna de acompanhamento mais larga quando o navegador está embutido.
- [x] Sem CDP no desktop, aviso discreto: "o navegador abre em janela separada".

## Fase 4 — Testes

- [x] Unitários do driver hospedado com `connectOverCDP` e hospedeiro falsos:
      procura pela URL marcadora, `showTab` em `openPlatform`, nenhuma abertura de
      Chromium próprio, `close` só desconecta.
- [x] Unitários do gerenciador de abas com `WebContentsView` falsa: uma por
      plataforma, visibilidade única, área `null` esconde, lista notifica.
- [x] Rotas `/aba/:plataforma`, `/api/v1/browser/tabs` e `/api/v1/browser/open`.
- [x] Desktop real (Playwright `_electron`): app abre; se o endpoint CDP existir,
      `POST /api/v1/browser/open` cria uma `WebContentsView` na janela e a aba
      aparece em `/api/v1/browser/tabs` apontando para o quadro local; sem endpoint,
      o app continua funcionando no modo separado.
- [x] Suítes existentes continuam verdes (unitários, desktop, e2e).

## Fase 5 — Entrega

- [x] `app/README.md` e `docs/DESKTOP.md` descrevem o modo embutido, o modo
      separado e o risco da porta de depuração.
- [x] Commit, push em `codex/fluxo-desktop`, instalador regenerado com SHA-256.

## Achados da implementação

- Quando o Playwright lança o Electron (smoke), a porta `--remote-debugging-port=0`
  **também** é criada: o modo embutido fica ativo e dois clientes CDP disputam
  os mesmos alvos (o Playwright do teste e o do backend), o que gera erros de
  diálogo. Por isso o e2e do desktop lança o Electron como a pessoa lança e fala
  com a porta por WebSocket puro (`Runtime.evaluate` só na janela), sem segundo
  Playwright.
- A repintura geral da interface espera a pessoa terminar de digitar (campo com
  foco); a seção do navegador se atualiza no lugar ao receber a lista de abas,
  para a aba recém-aberta aparecer na hora.
- A trava `estado/harness.lock` tinha uma janela em que o arquivo existia vazio;
  um leitor concorrente concluía "outra execução" (409). O leitor agora espera o
  dono ser gravado. Era a causa da instabilidade intermitente em
  `application-flow-api.test.mjs`.
- A URL fora do catálogo (quadro local dos testes) navegava dentro da aba da
  plataforma ativa; a aba ativa passa a ser definida antes de resolver a página.

## Revisão do checklist (antes de implementar)

- Ordem de partida: o endpoint só existe depois do `ready`; o worker é criado
  depois, então recebe o endpoint por argumento sem corrida.
- A URL marcadora depende da porta do servidor, conhecida só após `listen`: o
  hospedeiro recebe uma função `markerUrl(plataforma)` avaliada na hora, não uma
  string fixa.
- Diálogos da interface são modais sobre a página; a `WebContentsView` fica acima
  do renderer, por isso a interface manda `null` enquanto `#dialogo` estiver aberto.
- Quando o Playwright lança o Electron (smoke), ele já usa `--remote-debugging-pipe`;
  a porta pode não ser criada. O teste de desktop trata os dois casos e o app degrada
  para o modo separado sem erro.
- O driver não pode fechar o Electron: em modo hospedado `close()` só desconecta.
- Página fora do catálogo (quadro local dos testes) em modo hospedado vai para a
  aba `FLUXO`, escondida; assim os e2e continuam válidos também no desktop.
