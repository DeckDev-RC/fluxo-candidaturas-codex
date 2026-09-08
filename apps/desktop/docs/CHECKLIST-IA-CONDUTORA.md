# Checklist — a IA conduz a jornada (inversão de controle)

Objetivo: o agente do Codex app-server (ChatGPT) passa a ser o único condutor da
jornada, pelo chat. Ele lê o currículo, pergunta o que falta, abre uma plataforma
por vez no navegador visível, pede login quando precisa, busca, compara, preenche
e **para nos portões** (aprovação de envio, dado sensível, CAPTCHA/MFA). O
orquestrador programado deixa de comandar e vira: (a) biblioteca de serviços que
as ferramentas chamam; (b) caminho de reserva quando a IA está desconectada.

Decisões tomadas com a pessoa dona do produto (05/09/2026):

| Decisão | Escolha |
|---|---|
| Login nas plataformas | Navegador visível; a IA pede que a pessoa entre e continua depois |
| Navegador | Sempre visível, uma aba por plataforma, narração no chat |
| Autonomia | Até os portões: busca, compara e preenche sozinha; para em envio, login, CAPTCHA, dado sensível |
| Primeiro uso | Cartão curto (objetivo, currículo, plataformas) e a IA conduz o resto |
| Plataformas desta versão | Gupy, InfoJobs, LinkedIn |
| Teste de aceitação real | Até a revisão pré-envio; nenhuma candidatura real aprovada |

Regras que não mudam (AGENTS.md, POLITICA-AUTONOMIA.md, `product-policy.mjs`):
aprovação é humana e o agente não pode decidi-la; só fatos confirmados entram em
formulário; nenhuma senha, código ou token passa pelo chat; conta só o que a
plataforma confirmou visualmente.

Marque cada item quando a evidência (teste, captura ou execução) existir.

## Fase 0 — Contrato

- [x] Este checklist versionado em `docs/`.
- [x] Mapa técnico das ferramentas `fluxo_*`, orquestrador, navegador, política e riscos.
- [x] Decisões de produto registradas acima.

## Fase 1 — Agente operacional (backend)

- [x] `conversation-service`: modo operacional. A thread da conversa recebe as
      ferramentas `fluxo_*` e instruções de condução; um run `kind: 'autopilot'`,
      `mode: 'conversa'`, por sessão do processo, é dono das chamadas de ferramenta
      (`bindRun`), para `tool_run_mismatch` e `run_not_running` não bloquearem.
- [x] Turno assíncrono: `POST /api/v1/conversation/turn` devolve de imediato
      `{ turnId }`; o andamento vem por SSE em `GET /api/v1/conversation/events?stream=1`
      (`assistant.message`, `tool.started`, `tool.completed`, `turn.completed`,
      `turn.failed`, `waiting_user`). `POST /api/v1/conversation/interrupt` para o turno.
- [x] Chamadas de ferramenta observáveis: o adaptador avisa início e fim de cada
      `item/tool/call` com um resumo legível (sem segredo, sem HTML) e a conversa
      transmite para a tela.
- [x] Ferramentas novas para condução:
      - `fluxo_read_resume()`: texto do currículo selecionado e dados reconhecidos
        (não confirmados), para a pessoa validar em uma só mensagem.
      - `fluxo_open_platform({ platform })`: abre a plataforma na própria aba do
        navegador visível e informa se há login pendente (tela de login ou desafio).
      - `fluxo_browser_status()`: abas abertas, URL/título e desafio detectado.
      - `fluxo_discover` aceita omitir `searchUrl` e monta a busca a partir do
        objetivo confirmado e do catálogo da plataforma.
- [x] Retomada após portão: quando a pessoa aprova ou rejeita uma revisão na
      interface, o serviço envia um turno de sistema ao agente ("aprovação X
      registrada; prossiga" / "rejeitada; não envie") para ele continuar.
- [x] Instruções do agente condutor (`conversation-prompt.mjs`): protocolo de
      etapas, uma plataforma por vez, login manual, narração curta, portões,
      fatos confirmados, o que nunca fazer.
- [x] Caminho de reserva: sem IA conectada, "Começar" segue pelo orquestrador
      programado (comportamento atual), e a interface diz isso.

## Fase 2 — Navegador

- [x] Driver Playwright com uma aba por plataforma (`pageFor(platform)`),
      perfil persistente, sempre visível quando a IA conduz.
- [x] Detecção de login pendente (URL de login, campo de senha, botão "Entrar")
      e de desafio (CAPTCHA/MFA), exposta em `fluxo_open_platform` e
      `fluxo_browser_status`.
- [x] Página inicial/login de cada plataforma desta versão (Gupy, InfoJobs,
      LinkedIn) no catálogo de plataformas.

## Fase 3 — Interface

- [x] A conversa consome o SSE do agente: linhas curtas para cada ferramenta
      ("Abri o LinkedIn na aba do navegador", "Busquei 12 vagas na Gupy"),
      mensagens do assistente em tempo real, "Pensando…" enquanto o turno corre,
      cartão de "aguardando você" para login e aprovação.
- [x] "Começar" no cartão de primeiro uso: com IA conectada, envia o brief da
      campanha ao agente (objetivo, currículo, plataformas, metas) em vez de
      disparar o orquestrador; sem IA, mantém o caminho atual e avisa.
- [x] "Pausar" interrompe o turno do agente; "Encerrar campanha" interrompe e
      reinicia a conversa operacional.
- [x] Aprovação/rejeição pela interface acorda o agente (turno de sistema) e a
      conversa mostra a continuação.
- [x] Acompanhamento mostra as abas do navegador por plataforma com estado
      (entrou / login pendente / desafio).
- [x] Ruído removido: no modo IA, os eventos `autopilot.*` do orquestrador não
      duplicam a narração do agente.

## Fase 4 — Testes

- [x] Unitários: modo operacional com adaptador falso fazendo chamadas de
      ferramenta; eventos SSE; `fluxo_open_platform` e `fluxo_browser_status`
      com driver falso; `fluxo_discover` sem `searchUrl`; turno de sistema após
      aprovação; interrupção.
- [x] Suítes existentes continuam verdes (unitários, desktop, e2e offline com
      orquestrador de reserva).
- [x] Auditoria com a conta real do ChatGPT em ambiente isolado (dados
      sintéticos, quadro de vagas controlado, nenhuma plataforma real), 05/09/2026:
      brief do cartão → a IA leu o currículo e apresentou nome, e-mail, telefone e
      localização em uma mensagem → confirmação gravada (8 fatos) → abriu a
      plataforma na aba → buscou (3 vagas) → comparou → preparou → preencheu só
      confirmados → pediu revisão e parou. Aprovação pela interface acordou o
      agente, que enviou com `fluxo_submit`, confirmou o recebimento e resumiu a
      meta (1 de 1). Sem inventar dado: com o nome ausente, perguntou em vez de
      seguir. Achados corrigidos na hora: leitura do currículo pelo agente
      (`fluxo_read_resume`), tela presa em "primeiro uso" sem `perfil/candidato.md`,
      revisão vencida contada como decisão, duas linhas por ferramenta.
- [ ] Aceitação real, com a conta do ChatGPT e as contas de plataforma da pessoa,
      acompanhado: primeiro uso → currículo → objetivo → Começar → login manual
      pedido pela IA → busca real → comparação → preparo → **parar na revisão
      pré-envio**. Registrar o que a IA disse, o que abriu e onde parou. Depende
      da pessoa entrar nas plataformas; não pode ser feito pelo agente sozinho.

## Fase 4b — Plataformas reais (sondagem de 05/09/2026, somente leitura)

Nenhuma página pública de busca publica JSON-LD de vaga; a leitura genérica
anterior devolvia zero em todas. O driver passou a ler os **cartões** de cada
plataforma (`src/platform-cards.mjs`) e a esperar a lista renderizar.

| Plataforma | Página pública de busca | Leitura | Observação |
|---|---|---|---|
| Gupy | `portal.gupy.io/job-search/term=<q>` | 12 vagas, com empresa e local | URL corrigida (`term=`); a anterior ignorava o termo |
| InfoJobs | `vagas.aspx?palabra=<q>` | 20 vagas, com empresa e local | — |
| Vagas.com | `vagas-de-<q>` | 40 vagas, com empresa e local | — |
| LinkedIn | `jobs/search/?keywords=<q>&location=Brasil` | 0 sem login (authwall) | Esperado: a IA pede login na aba; cartões da versão logada estão no catálogo, a confirmar no teste acompanhado |
| Catho | `vagas/<q>/` | 403 para navegador automatizado | Bloqueio antibot; fora desta versão |
| Sólides | `?q=<q>` | 0 links de vaga | A busca não expõe cartões na URL usada; fora desta versão |

- [x] Leitor de cartões por plataforma, com empresa "não informada" quando o cartão não a traz.
- [x] Falso positivo de "biometria" removido (texto legal do LinkedIn acionava o desafio).
- [x] Aderência gravada na vaga (`queueService.recordFit`): nota, prioridade A/B/C e explicação, nos dois caminhos (IA e orquestrador).
- [x] Preflight herdado substituído pela preparação do app (`src/readiness-service.mjs`),
      feita para o fluxo com IA: só navegador ausente ou nenhuma plataforma com meta
      bloqueiam; perfil, currículo, IA e login viram avisos que a IA resolve na
      conversa; a meta total passa a ser a soma das plataformas. Roda na partida
      (sem consultar o app-server) e em "Verificar agora". `fluxo_discover` deixa de
      depender do preflight e só recusa plataforma fora da campanha.
- [ ] Aposentar o orquestrador programado como condutor (deixar só leitura offline): decisão adiada até a aceitação real com contas; hoje ele é o caminho de reserva sem IA.

## Fase 5 — Entrega

- [x] Documentação: este checklist marcado; `app/README.md` com o novo fluxo.
- [x] Commit, push em `codex/fluxo-desktop`, instalador regenerado com SHA-256.
