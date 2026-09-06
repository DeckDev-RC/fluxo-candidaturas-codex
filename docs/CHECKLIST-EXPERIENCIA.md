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
- [ ] Commit por frente, push, instalador com SHA-256.

## Pendente de validação com conta real

- Qualidade da extração de requisitos nas páginas reais de Gupy/InfoJobs/LinkedIn
  (seletores genéricos; ajustar por plataforma se a lista vier vazia).
- Notificações no Windows dependem do atalho instalado (AppUserModelId); em
  `win-unpacked` sem atalho a notificação pode não aparecer.
