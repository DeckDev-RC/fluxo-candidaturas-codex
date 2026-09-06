# Checklist — melhorias de experiência (levantamento de 06/09/2026)

Sete frentes, na ordem de impacto. Cada item marcado tem teste ou verificação real.

## 1. Aderência real

- [x] `fluxo_read_job(itemId)`: abre a página da vaga na aba da plataforma, extrai
      descrição, requisitos (listas sob "Requisitos/Qualificações/Requirements"),
      obrigatórios (eliminatórios), modalidade e faixa; grava na vaga; recalcula e
      grava a aderência. (`playwright-driver.mjs: observeJobPage`,
      `browser-adapter.mjs: readJob`, `queue-service.mjs: updateItemDetails`)
- [x] Interface: sem requisitos lidos, o selo diz "aderência não medida" e a frase
      explica que a página ainda será lida, em vez de "50% coincidem".
- [x] Instrução da IA: `fluxo_shortlist` ordena; `fluxo_read_job` nas melhores (até 3)
      antes de apresentar ou preparar.
- [x] Narração e testes: `ferramentas-exercitadas` (quadro falso) e
      `e2e/platform-cards` (Chromium real, página com Requisitos/Obrigatórios/Benefícios).

## 2. Fila organizada por busca

- [x] Cada vaga carrega a busca que a trouxe (`searchQuery`, `searchAt`), vindo do
      termo passado em `fluxo_discover(query)` ou lido da URL de busca.
- [x] Oportunidades agrupadas por busca ("Busca de 06/09, 11:46 · COBOL"), a mais
      recente primeiro; ordenação escolhida vale dentro de cada grupo.
- [x] Acompanhamento diz "N da busca mais recente (termo) · M de buscas anteriores".
- [x] Cartão de seleção para descartar (`AÇÃO: selecionar-descarte=todas|ids`):
      caixas de marcar, "Marcar todas", "Descartar selecionadas"; o resultado volta
      para a IA como evento SISTEMA. (`screens/partes/cartoes-ia.mjs`)

## 3. Menos espera às cegas

- [x] Login detectado sozinho: ao emitir `waiting_user` (login/verificação/cookies) o
      serviço observa a aba a cada 3 s por até 10 min; resolvido, emite
      `waiting_resolved` e manda um turno de sistema para a IA continuar. Uma fala
      da pessoa encerra a observação. (`conversation-service.mjs: observarEspera`)
- [x] Notificações do sistema quando a janela não está em foco (login, aprovação,
      falha), barra de tarefas piscando, clique traz a janela; `setAppUserModelId`
      no Windows. Web: Notification API se permitida. (`core/notificacoes.mjs`,
      `desktop/main.cjs: fluxo:notificar`)

## 4. Primeiro uso mais fluido

- [x] Cartão de confirmação dos dados do currículo (`AÇÃO: confirmar=campo:valor|…`):
      campos editáveis, "Está certo, confirmar" grava tudo em `/api/v1/memory/answers`
      e avisa a IA; "Prefiro responder por escrito" fecha.
- [x] Respostas rápidas (`AÇÃO: opcoes=a|b|c`): botões que enviam o texto como fala.
- [x] O cartão de primeiro uso já é substituído pela situação seguinte após "Começar"
      (a fala atual é recalculada do estado); nada a mudar.

## 5. Confiança durante o trabalho

- [x] Passo em andamento mostra ponto pulsando e segundos decorridos; ao concluir,
      registra quanto levou quando passou de 3 s. Turno concluído ou falho encerra
      qualquer passo pendente. (`conversa.mjs: emAndamento/settleSteps`)
- [x] Falha de ferramenta traduzida por código (`platform_disabled`, `search_unavailable`,
      `manual_intervention_required`, …) para o que a pessoa pode fazer; mensagem com
      cara de programador não vaza. (`conversation-narration.mjs: traduzirFalha`)

## 6. Aba com controles

- [x] Mini cabeçalho da aba visível: voltar, recarregar, endereço legível
      (`linkedin.com/jobs/search`), "Abrir fora" (navegador do sistema, só http(s)).
- [x] "Ampliar/Reduzir": a coluna de acompanhamento cresce e a área ocupa a altura
      da janela.
- [x] Miniatura: na coluna estreita as abas ficam em zoom 0,67 (`setZoomFactor`),
      então o site desenha o layout de computador inteiro, reduzido, em vez do
      layout apertado de celular. Volta a 100% ao ampliar e, sozinho, quando a IA
      está esperando login/verificação/cookies na aba. O zoom é reaplicado a cada
      navegação (o Chromium o guarda por origem). Driver da IA não é afetado
      (coordenadas da página).

## 7. Detalhes

- [x] Dicionário único de rótulos (`core/rotulos.mjs`): situações de candidatura e de
      fila em pt-BR; Oportunidades não mostra mais o status interno cru.
- [x] Pluralização real (`plural`, `concorda`) no cabeçalho, avisos e cartões.
- [x] Foco preservado após repintura (por id do elemento ativo).
- [x] Atalhos: "/" foca a conversa; Esc fecha diálogo ou volta à conversa; listados
      na Ajuda e no placeholder.

## Entrega

- [x] Suítes verdes: unitários (348), desktop (abas com controles), e2e (23), smoke.
- [x] Verificação visual: lista agrupada, cartões de descarte/confirmação/opções,
      selo "não medida", atalho "/".
- [x] Commit por frente, push (`codex/fluxo-desktop`), instalador
      `dist/desktop/Fluxo-1.2.0-Windows-x64.exe` com SHA-256 ao lado.

## Achado do teste real (12:30) e correção

- A IA respondeu "não consigo limpar a fila pelas ferramentas disponíveis" com
  `fluxo_discard` já existindo. Causa: o app-server guarda as ferramentas dinâmicas
  no metadado da thread quando ela nasce e `thread/resume` não aceita lista nova
  (`ThreadResumeParams` não tem `dynamic_tools`); a thread antiga era retomada a
  cada abertura com o conjunto velho. Correção: `conversa.json` guarda a assinatura
  do conjunto de ferramentas; se mudou, uma thread nova começa
  (`conversation-service.mjs: assinaturaDasFerramentas`).
- A memória não se perde: `conversa.json` guarda também o `runId` da sessão; quando
  a thread anterior não pode ser retomada (ferramentas novas ou app-server a perdeu),
  as últimas 12 falas (pessoa/Fluxo, sem ferramentas, 240 caracteres cada) dos
  eventos gravados entram no contexto do primeiro turno como "Conversa anterior
  (memória resumida)". Sem chamada extra ao modelo. `thread/fork` foi descartado:
  também não aceita `dynamic_tools`.
- Vagas gravadas pelo leitor de cartões antigo (plataforma "CARD", título "X X")
  são saneadas na leitura da fila (`queue-service.mjs: sanearHerdado`).

## Achados do teste real (12:54) e correções

- "Não deu certo: a ferramenta não pode executar esta ação com o contexto informado":
  a IA chamou `fluxo_state` com um `scope` inventado ("summary"). Agora a descrição da
  ferramenta lista os escopos válidos e um escopo desconhecido devolve o estado
  completo com uma nota, em vez de falhar.
- A aba aberta pela IA ficava oculta até a pessoa clicar: `abas.abrir` passa a
  mostrar a aba recém-aberta (sem efeito se já era a visível).
- Glitch enquanto a IA abria: a view nascia a 100% e encolhia para a miniatura na
  primeira navegação; agora nasce com `webPreferences.zoomFactor` no zoom vigente.
- Rolagem separada: na mesa larga, a conversa e o acompanhamento rolam cada um por
  si (`.area[data-area="agora"]` não rola; as colunas têm `overflow-y: auto`). A
  barra fixa da situação, a rolagem para o fim e o recorte da aba embutida passaram
  a usar o contenedor que rola de fato. Em janela estreita (< 68 rem) a área volta a
  rolar inteira.

## IA operadora do app (pedido de 13:12)

- [x] **Rolagem da conversa**: a coluna é recriada a cada repintura; agora quem estava
      no fim continua no fim e quem subiu para reler fica onde estava
      (`conversa.mjs: conversationColumn`).
- [x] **Navegador livre** (`browser-free.mjs`, `browser-free-tools.mjs`): a IA vê a
      página como elementos com ref (links, botões, campos, listas; na tela primeiro)
      e age: `fluxo_browser_observe|read|click|type|select|press|scroll|navigate|back`.
      Portões: senha/código recusados (`password_field_forbidden`); ação com efeito
      fora do app (enviar, aceitar, conectar, seguir, excluir, publicar, pagar…) exige
      `confirmed=true` depois do sim da pessoa (`confirmation_required`); CAPTCHA/MFA
      para (`manual_intervention_required`); só URL http(s) pública; texto passa pela
      fronteira de confiança. Testes em Chromium real (`e2e/browser-free.test.mjs`).
- [x] **Configuração pelo chat** (`app-config-tools.mjs`): `fluxo_campaign`
      (plataformas, metas, meta total, limite por execução), `fluxo_schedule`
      (consulta automática), `fluxo_codex_settings` (modelo, esforço, verbosidade;
      lista modelos), `fluxo_export` (evidências, cópia compartilhável). Ações de
      interface: `AÇÃO: tema=…`, `AÇÃO: limpar-conversa=sim` (com confirmação).
      Fora do alcance, por desenho: aprovação, consentimentos, dados sensíveis, apagar
      histórico, conta/login do ChatGPT, pasta de dados, reiniciar serviço.
- [x] **Currículo pelo chat**: clipe ao lado da caixa de escrever e arrastar-e-soltar
      na coluna; importa pelo mesmo caminho do primeiro uso e avisa a IA por SISTEMA
      para ler e confirmar com o cartão (`conversa-anexo.mjs`).
- [x] **Instruções**: papel de operador do app; onboarding inteiro pela conversa em
      blocos (apresentação, currículo, objetivo, plataformas e metas, resumo); regras
      do navegador livre (observar antes de agir, limite de ações por pedido,
      confirmação para efeito externo); orientar e dar dicas, não só executar.
- [x] Validador de ferramentas aceita parâmetros `object` opcionais ausentes.

## Achado do teste real (13:40): conversa parada até a próxima mensagem

- Os eventos do turno estavam gravados (ferramentas às 16:40:23–44Z) e, em Chromium
  puro, a mesma sequência atualiza a conversa ao vivo. O que difere no desktop é
  a aba embutida aparecendo por cima da interface no meio do turno: reordenar a
  view (remover/adicionar) e mostrá-la pode deixar o compositor da janela sem
  apresentar o próximo quadro da interface até uma interação (o mesmo mecanismo
  dos "glitches" relatados). Correção: `mostrar` não reordena mais (só uma aba é
  visível; a ordem não importa) e toda mudança de visibilidade pede uma repintura
  explícita da janela (`webContents.invalidate`, agrupada em 50 ms).

## Leitura da conversa (pedido de 13:56)

- [x] **Bloco de atividade** (`screens/partes/atividade.mjs`): passos seguidos da IA
      viram um `<details>` recolhido; em curso mostra o passo atual com sinal pulsando
      e tempo total; concluído mostra "N etapas · 12s" (aviso quando houve falha).
      Passos idênticos em sequência contam uma vez ("Estado lido. ×10"). Abrir/fechar
      é lembrado entre repinturas.
- [x] **Fala estruturada** (`core/fala.mjs`), inspirada na ideia de UI generativa
      (Thesys C1: o modelo desenha a resposta, a interface renderiza componentes),
      sem dependência externa: subconjunto seguro de marcação — `## Seção`,
      `- item`, `1. item`, `**destaque**`, `> Atenção|Dica|Pronto: nota` — renderizado
      com nós de texto (nunca HTML). O serviço normaliza marcação fora do subconjunto
      (títulos de outro nível, `__x__`, `* item`, tabelas, crases).
- [x] **Instruções**: não narrar antes de agir (a atividade já mostra), conclusão em
      uma frase primeiro, seções por tema em revisões, uma nota por resposta, terminar
      com próximo passo ou opções.
- [x] **Componentes generativos** (14:33): `### Nome` vira cartão (cartões seguidos
      lado a lado, para comparar); `Rótulo: valor` vira ficha alinhada; rótulos de
      lista (Stack, Tecnologias…) viram fichas; níveis (alta/média/baixa, pendente/
      conectado) viram selos; nota tingida por tom; a fala estruturada tem superfície
      própria. Modelos obrigatórios no prompt para análise/comparação e revisão.

## Pendente de validação com conta real

- Qualidade da extração de requisitos nas páginas reais de Gupy/InfoJobs/LinkedIn
  (seletores genéricos; ajustar por plataforma se a lista vier vazia).
- Notificações no Windows dependem do atalho instalado (AppUserModelId); em
  `win-unpacked` sem atalho a notificação pode não aparecer.
