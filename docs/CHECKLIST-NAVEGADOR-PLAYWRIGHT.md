# Checklist — navegador da IA no nível do Codex (Playwright MCP por dentro do Fluxo)

Objetivo: dar à IA do Fluxo a mesma forma de operar sites que o Codex tem com a
skill `$playwright` (Playwright MCP), mantendo os portões do produto: senha e
código são da pessoa, ação com efeito para terceiros só com confirmação, parada
em CAPTCHA/MFA, só endereços públicos, fronteira de confiança e orçamento de
campanha.

## Decisões (verificadas em 06/09/2026)

- O que faz o Codex assertivo é o **Playwright MCP**: snapshot hierárquico de
  acessibilidade com refs (`[ref=e12]`), ações por ref re-resolvidas, espera por
  texto/estado, screenshot, tratamento de diálogos, e um método de trabalho
  (snapshot → ação → snapshot).
- Não é preciso adicionar dependência: o `playwright` 1.63 já instalado expõe a
  mesma máquina do MCP como API pública — `page.ariaSnapshot({ mode: 'ai' })`
  gera o YAML com refs e o seletor `aria-ref=eN` resolve cada ref. Usar a API
  pública em vez de embutir `@playwright/mcp` evita um segundo cliente CDP na
  mesma janela, evita que a IA veja a própria interface do app como "aba" e
  mantém todas as ações passando por `domain-tools` (validação, orçamento,
  trava, portões).
- O app-server aceita `inputImage` (data URL) em respostas de ferramenta
  dinâmica: screenshot pode ir para o modelo como imagem.
- Refs continuam válidas só até a página mudar (igual ao MCP). Por isso cada
  ação devolve um snapshot novo e a instrução manda observar antes de agir.

## Fase 1 — Snapshot hierárquico (o que a IA vê)

- [x] `fluxo_browser_observe(platform, query?, maxChars?)` devolve `snapshot`
      (YAML do `ariaSnapshot({ mode: 'ai' })`), `url`, `title`, `loginPending`,
      `challenge`, `consentPending`, `truncated`.
- [x] `query` filtra as linhas do YAML que contêm o texto (com o caminho de
      ancestrais preservado) para páginas grandes.
- [x] Limite de tamanho (padrão 12 mil caracteres) com aviso `truncated` e dica
      de usar `query`.
- [x] Fallback: se `ariaSnapshot` não existir (driver de teste/quadro falso),
      usa o observador plano atual.

## Fase 2 — Ações por ref (como a IA age)

- [x] `click`, `type`, `select`, `scroll(ref)`, `hover` resolvem `aria-ref=eN`.
- [x] Alternativa por papel e nome quando a ref sumiu: `fluxo_browser_find`
      não é necessária — `click`/`type`/`select` aceitam `ref` OU `role`+`name`
      (`getByRole(role, { name, exact: false })`; ambíguo → erro pede ref).
- [x] `type` em `contenteditable` (compositor de mensagens do LinkedIn) funciona
      via `fill`; `submit=true` pressiona Enter; `slowly=true` digita tecla a tecla
      para campos com autocompletar.
- [x] Ref inexistente/obsoleta devolve erro legível (`browser_reference_ambiguous`)
      com instrução de observar de novo; nunca clica "no que sobrou".
- [x] `press` amplia a lista de teclas (letras/números únicos e combinações
      `Control+A`, `Shift+Enter`), sem `F5`/`F12` e sem atalhos do sistema.

## Fase 3 — Espera (o que faltava no LinkedIn)

- [x] `fluxo_browser_wait(platform, text?, textGone?, seconds?)`: espera texto
      aparecer/sumir (até 15 s) ou tempo (até 10 s); devolve snapshot novo.
- [x] Toda ação já espera `networkidle` curto; `navigate` espera `domcontentloaded`
      + assentamento.

## Fase 4 — Visão (quando a estrutura não basta)

- [x] `fluxo_browser_screenshot(platform, ref?)`: PNG da área visível (ou do
      elemento), reduzido a ≤ 1280 px de largura, entregue ao modelo como
      `inputImage`. Só quando a pessoa pediu algo visual ou após 2 observações
      sem progresso (instrução). Não é gravado em disco; a narração diz "olhei a
      tela".
- [x] `agent-adapter` monta `contentItems` com `inputImage` quando o resultado
      da ferramenta traz `imagem` (data URL) — o restante segue como texto.

## Fase 5 — Portões preservados

- [x] Senha/código: `type` recusa quando o alvo é `type=password`,
      `autocomplete=one-time-code` ou nome/id contém senha/otp
      (`password_field_forbidden`).
- [x] Efeito externo: `click` em elemento cujo nome acessível casa com
      `ACAO_SENSIVEL` (enviar, aceitar, conectar, seguir, publicar, excluir,
      pagar…) exige `confirmed=true` (`confirmation_required`).
- [x] Desafio: CAPTCHA/MFA na aba interrompe qualquer ação
      (`manual_intervention_required`).
- [x] `navigate` só http(s) público (`assertUrlPublica`).
- [x] Texto do snapshot passa pela fronteira de confiança (`assertTrustedPage`).
- [x] Orçamento: todas as ferramentas do navegador contam como leitura externa.

## Fase 6 — Método de trabalho (o SKILL.md do Playwright, adaptado)

- [x] Instruções: observar antes de agir; agir por ref do último snapshot; após
      navegação/clique que muda a tela, observar de novo (a ação já devolve);
      usar `wait` quando a tela está carregando; usar `query` em páginas grandes;
      screenshot só quando travado; nomear o elemento pelo texto do snapshot na
      narração ("cliquei em 'Mensagem' de Pessoa Exemplo").
- [x] Receita para "mandar mensagem no LinkedIn": perfil → botão "Mensagem" →
      `wait` pelo compositor (`textbox "Escreva uma mensagem"`) → `type` → pedir
      confirmação com o texto exato → `click` "Enviar" com `confirmed=true` →
      `wait` pela mensagem na conversa → reportar.

## Fase 7 — Testes

- [x] `e2e/browser-free.test.mjs` (Chromium real): snapshot com refs `e1..eN`,
      hierarquia (botão dentro de item de lista), `query`, clique por ref, clique
      por `role+name`, `type` em `contenteditable`, `wait` por texto que aparece
      após atraso, ref obsoleta após re-render (elemento substituído pelo
      "React") → erro legível e recuperação por `role+name`, screenshot devolve
      PNG (data URL), senha recusada, ação sensível exige confirmação.
- [x] `ferramentas-exercitadas`: quadro falso cobre as ferramentas novas
      (`wait`, `screenshot`, `hover`) — toda ferramenta registrada é exercitada.
- [x] `conversation-service`: narração das ferramentas novas; adapter monta
      `inputImage`.
- [x] Suítes completas verdes (unitários, desktop, e2e) e smoke do desktop.

## Fase 8 — Entrega

- [x] Assinatura de ferramentas muda → thread renovada com memória resumida (automático:
      definições novas entram na assinatura).
- [x] `docs/DESKTOP.md` e `docs/CHECKLIST-EXPERIENCIA.md` apontam para este documento.
- [x] Commit, push, instalador com SHA-256.

## Resultado da implementação (06/09/2026)

- `app/src/browser-free.mjs`: snapshot via `ariaSnapshot({ mode: 'ai' })`, filtro
  por `query` com ancestrais, limite com aviso, alvo por `aria-ref=` ou
  `getByRole(role, { name })` (ambíguo lista candidatos), `type` com `fill` /
  `pressSequentially`, `wait` por texto/rótulo/placeholder ou tempo, `hover`,
  `screenshot` como data URL, teclas com Control/Shift.
- `app/src/browser-free-observer.mjs`: scripts de página (nome acessível, texto,
  observador plano de reserva).
- `app/src/browser-free-tools.mjs`: 12 ferramentas `fluxo_browser_*`.
- `app/src/agent-adapter.mjs`: `imagem` vira `inputImage`; não vai a narração nem
  histórico.
- `app/src/conversation-prompt.mjs`: método Playwright (observar → agir → observar,
  refs do último snapshot, query, wait, screenshot só travado) e receita de
  mensagem no LinkedIn.
- Testes: `e2e/browser-free.test.mjs` (Chromium real) cobre hierarquia, refs
  duplicadas, filtro, corte, senha, confirmação, ref obsoleta após re-render,
  role+name (único, ambíguo, inexistente), select, scroll até elemento, teclas
  permitidas e proibidas, painel com atraso + `wait` + `type` em contenteditable +
  Enviar confirmado, screenshot de tela e de elemento, busca com Enter, voltar,
  leitura longa, URL pública. `ferramentas-exercitadas` exercita as 12.
- Achado na implementação: `wait` por texto precisa considerar rótulo acessível e
  placeholder (o compositor do LinkedIn é um `textbox` com `aria-label`, sem texto).

## Achados do teste real (06/09, 19:30: mensagem para uma conexão) e correções

Sequência gravada: entrar, achar a conexão, abrir o perfil e ler funcionaram;
"clicar" falhava em ciclo ("a página mudou") e a IA desviou para /messaging/compose
e depois clicou "Enviar mensagem com Premium" (portão) — nunca chegou ao envio.

1. **Refs com prefixo de frame.** Depois da primeira navegação no mesmo frame o
   Playwright numera refs como `f4e5`, não `e5`. O resolvedor só reconhecia `e5`
   e mandava as demais para o caminho errado → toda ação por ref falhava.
   Corrigido (`REF_PLAYWRIGHT`); e2e cobre.
2. **Ref perdida por re-render.** Sites em React recriam nós; a ref some entre o
   snapshot e o clique. Agora o resolvedor lembra ref → papel/nome dos snapshots
   recentes (acumulado, até 3.000) e reencontra o elemento por papel+nome exato
   visível (`target.recovered = true`).
3. **Nome parcial ambíguo.** `getByRole(name, exact:false)` casava "Enviar
   mensagem" e "Enviar mensagem com Premium". Agora: exato e visível primeiro;
   depois parcial e visível; ambíguo lista os nomes.
4. **"Enviar mensagem" abre, não envia.** O portão de confirmação barrava o botão
   que só abre o compositor. Exceção explícita (`ABRE_COMPOSITOR`); o "Enviar" de
   dentro continua no portão.
5. **Editor que ignora `fill`.** O compositor só habilita "Enviar" com eventos de
   teclado; `type` em `contenteditable` agora clica, seleciona tudo e digita tecla
   a tecla, e confere que o texto entrou (`type_not_applied`).
6. **Erros acionáveis.** Timeout do Playwright vira `element_not_actionable` com a
   causa (coberto por X, escondido, desabilitado, não editável) e o próximo passo.
7. **Região da ação.** Cada ação devolve `region`: o diálogo que abriu (ou o
   formulário ao redor) com refs novas — é ali que o próximo passo está.
8. **Instruções.** Receita do LinkedIn reescrita: perfil → "Enviar mensagem" (exato)
   → digitar no compositor sem Enter → mostrar texto e pedir sim → "Enviar"
   confirmado → esperar a mensagem aparecer.

## Guardas mecânicas (07/09/2026)

O método pede à IA que verifique cada ação, não repita e explique falhas. A partir
desta rodada, o código garante isso (`app/src/browser-free-guard.mjs`), em vez de
depender só da instrução:

- [x] `changed` em toda ação: impressão digital da página (URL + árvore de
      acessibilidade sem refs, foco e cursor) antes e depois. `false` = o clique
      não pegou, o campo não aceitou ou a rede falhou; a IA não segue supondo.
- [x] Detector de loop: a mesma ação (tipo, alvo, valor, `confirmed`) repetida sem a
      página mudar é barrada na terceira vez com `browser_loop_detected` e a
      orientação de mudar de estratégia (outra consulta, `wait`, screenshot, outro
      elemento, perguntar). Ação que muda a página zera a contagem.
- [x] Diagnóstico de console e rede: erros de console, `pageerror`, requisições
      falhas e respostas 4xx/5xx (só fetch/XHR/documento) desde a ação, sem query
      string nem corpo. Vão em `diagnostics` quando a página não mudou (ou houve
      erro de console) e em `details.diagnostics` quando a ação falha.
      "POST /login → 403" substitui "não aconteceu nada".
- [x] `fluxo_browser_find(platform, text)`: o `observe` já filtrado, com nome
      explícito para a IA preferir quando sabe o que procura. Ordem sugerida na
      instrução: find → observe(query) → read → screenshot.
- [x] Assentamento de rede real: `waitForLoadState('networkidle')` resolve na hora
      quando o documento já esteve ocioso, então um clique numa SPA era lido antes
      da resposta chegar (achado do teste desta rodada). Agora as requisições
      fetch/XHR em voo são contadas e a ação só devolve a tela depois que terminam
      e a página fica 300 ms quieta (limite 6 s).

Testes: `app/test/browser-free-guard.test.mjs` (impressão, assinatura, loop,
diagnóstico, assentamento) e o cenário "login quebrado" em
`e2e/browser-free.test.mjs` (clique que não muda a tela, 403 e erro de console no
resultado, terceira repetição barrada, segredo da query string fora).

## Contrato do Playwright MCP, esforço e contexto (07/09/2026, tarde)

Por que Codex e Claude Code parecem "quase perfeitos" no navegador: o modelo foi
treinado nas ferramentas exatas do Playwright MCP, roda com raciocínio alto e com um
contexto só da tarefa. Os três pontos entraram no Fluxo sem abrir mão de sessão
local, sem shell e com portões.

- [x] Ferramentas com os nomes e parâmetros do Playwright MCP
      (`app/src/browser-free-tools.mjs`): `browser_snapshot`, `browser_find`,
      `browser_click(element, target)`, `browser_type(element, target, text, submit,
      slowly)`, `browser_select_option(element, target, values)`, `browser_hover`,
      `browser_press_key(key)`, `browser_navigate(url)`, `browser_navigate_back`,
      `browser_wait_for(text | textGone | time)`, `browser_take_screenshot`,
      `browser_console_messages`, `browser_network_requests`; nossos:
      `browser_read_text`, `browser_scroll`. Extensões opcionais: `platform` (sem ela,
      a aba em foco), `query` no snapshot, `role`+`name` no lugar de `target`,
      `confirmed` no clique. `ref` continua aceito como sinônimo de `target`.
      Mapa: observe→snapshot, read→read_text, select→select_option (`values`),
      press→press_key, wait→wait_for (`seconds`→`time`), screenshot→take_screenshot,
      back→navigate_back. `fluxo_open_platform` e `fluxo_browser_status` seguem
      como estão (são do app, não da página). A assinatura das ferramentas mudou:
      threads antigas são substituídas na primeira mensagem.
- [x] Esforço de raciocínio por turno (`conversation-intent.mjs`): pedido de
      navegação sobe o `effort` do turno até `high` quando a configuração da pessoa
      está abaixo e o catálogo do modelo aceita; nunca desce o que ela escolheu;
      pergunta geral volta ao configurado.
- [x] Contexto enxuto no turno de navegação (`montarContexto` com `modo:
      'navegador'`): só abas, plataforma em foco e plataformas habilitadas, mais o
      lembrete do método. Metas, fila, currículo, lacunas e situação ficam de fora
      (a memória da thread segue inteira). Evento da interface (SISTEMA) nunca é
      navegação. Classificação local por expressões: campanha ("buscar vagas",
      "candidatar", "fila", "meta") vence; "sim"/"manda" curto depois de um turno
      que usou `browser_*` continua no modo navegador.

Testes: `ferramentas-exercitadas.test.mjs` (contrato novo, `target`→ref,
`values`, `time`, aba em foco, `platform_required`, console e rede),
`conversation-service.test.mjs` (classificação, esforço, contexto enxuto, ponta a
ponta com `effort: high` e continuação).

### O que foi avaliado e não adotado

- Playwright CLI + Skills: exige shell para o modelo; o harness roda sem shell de
  propósito (a IA só age pelos portões do app).
- Stagehand / Browserbase / Computer Use: segundo modelo com chave de API decidindo
  cliques dentro da sessão autenticada da pessoa, ou navegador na nuvem com os
  cookies dela. Contra "local, privado, sem chave" e contra os portões.

## Mapeamento da InfoJobs em conta real (07/09/2026)

Sessão autenticada da pessoa na aba embutida; sondagem lida pelo CDP da janela.

- Busca: `.js_rowCard`, título `h2.js_vacancyTitle`, empresa é o link
  `/empresa-…aspx` (confidencial vem sem link), local em `.mb-8` com a distância
  ("a 648 Km de você") anexada, linha de detalhes com salário, escolaridade e
  modalidade (Home office/Híbrido/Presencial). Rolagem infinita, sem paginação.
  Remoto tem URL própria: `/vagas-de-emprego-<termo>-trabalho-home-office.aspx`.
- Vaga: cabeçalho com título, empresa, local, salário e modalidade; descrição num
  parágrafo só com marcadores inline ("Requisitos Obrigatórios: - a - b
  Diferenciais: - c"); blocos "Exigências" (eliminatórias), "Valorizado" e
  "Habilidades" (tags); "Tipo de contrato e Jornada" em `<p>`. Botão
  `.js_btApplyVacancy` "CANDIDATAR-ME"; os "Candidatar-me" das vagas similares
  são `.js_btnApplySimilar` e ficam fora.
- Candidatura em um clique (vaga 90000001, Empresa Sintética, React): sem formulário nem
  perguntas; aparece `h3` "Você se candidatou à vaga <cargo>" e um convite ao
  plano Premium ("Agora não"). Ao revisitar, a página volta a mostrar
  "CANDIDATAR-ME": a InfoJobs não expõe candidatura anterior na tela, então a
  proteção contra reenvio é o histórico do app (dedupe por URL).
- No app: o botão da plataforma vira o campo `submit` do snapshot (o envio do
  fluxo padrão clica nele), a confirmação é lida pelo texto da plataforma
  (`platform-job.mjs` → `confirmation`, `confirmationText`, `previousText`,
  `dismiss`), `inspectConfirmation` aceita "você se candidatou" e trata "já se
  candidatou" como candidatura anterior, e o adaptador espera a confirmação antes
  de fechar o convite. Réplica em `e2e/platform-cards.test.mjs`.
- Pendente: vaga com perguntas eliminatórias (`.js_visibleWhileKillers`) ainda não
  apareceu na conta; mapear quando surgir.

## Revisão do checklist (antes de implementar)

- Risco: `ariaSnapshot` em páginas enormes (feed do LinkedIn) pode passar de 100
  mil caracteres. Mitigação: limite + `query`; `depth` não é usado porque
  esconde exatamente os botões que a IA precisa.
- Risco: refs de `aria-ref` são por página e expiram no próximo snapshot; a IA
  precisa usar sempre o último. Mitigação: cada ação devolve snapshot novo e a
  instrução diz isso; `role+name` como saída.
- Risco: screenshot leva imagem da tela da pessoa ao modelo. Mitigação: só sob
  pedido/travamento, nunca gravado, narrado na conversa.
- Risco: `getByRole` com `name` parcial pode casar vários. Mitigação: exige
  unicidade; ambíguo devolve as opções encontradas para a IA escolher a ref.
- Fora de escopo, por decisão: código Playwright arbitrário (`evaluate`), abrir
  abas novas fora das plataformas, upload livre de arquivos (só o currículo
  pelo `fluxo_fill`).
