# Histórico de versões

## 1.4.1 — 2026-09-07 — classificador de pedido calibrado nos turnos reais

Os 61 turnos gravados até aqui foram rotulados pelas ferramentas que a IA usou em seguida e o classificador foi ajustado sobre eles: campanha lida como navegação (que perdia metas e fila) caiu de 14 para 0; navegação reconhecida subiu de 23 para 30 de 34; os 4 restantes caem no lado seguro (contexto inteiro). Mudanças: continuação só depois de turno só de navegador; "vaga", "procure", "busque", "aplique", "app", "configurar" e "histórico" são campanha; saudação e aviso de login feito voltam ao contexto inteiro. Método e números em `docs/CHECKLIST-NAVEGADOR-PLAYWRIGHT.md`.

## 1.4.0 — 2026-09-07 — navegador no contrato do Playwright MCP, esforço alto e contexto enxuto em navegação

Evidência nesta base: 356 testes do app, 14 do desktop e 25 de navegador real. O que faz Codex e Claude Code parecerem tão bons no navegador (ferramentas que o modelo reconhece do treino, raciocínio alto e contexto só da tarefa) entrou no Fluxo sem abrir mão de sessão local, sem shell e com portões.

- Ferramentas de navegador com os nomes e parâmetros do Playwright MCP: `browser_snapshot`, `browser_find`, `browser_click(element, target)`, `browser_type`, `browser_select_option(values)`, `browser_hover`, `browser_press_key`, `browser_navigate`, `browser_navigate_back`, `browser_wait_for(text | textGone | time)`, `browser_take_screenshot`, `browser_console_messages`, `browser_network_requests`, mais `browser_read_text` e `browser_scroll`. `platform` passou a ser opcional (aba em foco); `role`+`name` e `confirmed` continuam como extensões.
- Turno de navegação sobe o esforço de raciocínio até `high` quando a configuração está abaixo e o modelo aceita; pergunta geral volta ao configurado.
- Turno de navegação recebe contexto enxuto (abas, foco, plataformas) em vez de metas, fila, currículo e lacunas; "sim"/"manda" curto depois de um turno no navegador continua nesse modo.
- Esquema de ferramentas aceita listas (`values`); erros de ferramenta levam `details` ao modelo.

## 1.3.0 — 2026-09-07 — InfoJobs mapeada em conta real e guardas mecânicas do navegador

Evidência nesta base: 355 testes do app, 14 do desktop e 25 de navegador real (Chromium). Primeira evidência R de plataforma: sondagem da InfoJobs autenticada pela aba embutida e uma candidatura real confirmada ("Você se candidatou à vaga Desenvolvedor(A) React", Empresa Sintética, 90000001), autorizada pela pessoa e feita pela sonda de mapeamento; evidência em `evidencias/infojobs-90000001-confirmacao-2026-09-07.png` na pasta de dados. O fluxo de envio do próprio app foi validado na réplica fiel da página; a validação dele em conta real fica para a próxima candidatura.

InfoJobs (`platform-cards.mjs`, `platform-search.mjs`, `platform-job.mjs`):

- cartões de busca com empresa (link `/empresa-`), local sem a distância, modalidade, salário e data;
- URL própria para busca remota (`…-trabalho-home-office.aspx`);
- leitor da página da vaga: requisitos, exigências eliminatórias, diferenciais, contrato, botão certo ("CANDIDATAR-ME", ignorando os das vagas similares);
- candidatura em um clique: o botão da plataforma vira o campo `submit`, a confirmação é lida pelo texto da plataforma, "já se candidatou" vira candidatura anterior, e o convite Premium é fechado depois da confirmação.

Navegador da IA (`browser-free-guard.mjs`):

- `changed` em toda ação (a página mudou?) por impressão digital da árvore de acessibilidade;
- detector de loop: a mesma ação repetida sem a página mudar é barrada na terceira vez;
- diagnóstico de console e rede (4xx/5xx, sem query string) quando a ação não muda a tela ou falha;
- `fluxo_browser_find(platform, text)`: observar já filtrado, para gastar menos contexto;
- assentamento de rede real após cada ação: as requisições fetch/XHR disparadas terminam antes de a tela ser lida (`networkidle` resolvia na hora em SPA).

## 1.2.0 — 2026-09-05 — candidata com jornada controlada certificada e interface repaginada

Evidência D/I/B nesta base: 293 testes do app, 6 do desktop e 19 de navegador real. Nenhuma evidência R de plataforma real; nenhum envio real autorizado.

Interface repaginada na direção Trajetória, com arquitetura por área do candidato:

- áreas Agora, Oportunidades, Candidaturas, Meu perfil, Decisões, Configurações e Ajuda substituem a navegação por ferramenta de implementação;
- tela Agora deriva 11 estados do estado persistido, incluindo envio incerto, IA indisponível, pausa e campanha concluída;
- caixa de decisões por urgência, com revisão pré-envio nomeando a empresa e execução automática da revisão aprovada;
- tokens de cor, tipografia, espaçamento, borda, elevação e movimento com contraste verificado por teste;
- interface dividida em módulos por área; nenhum uso de `innerHTML` com conteúdo de página externa;
- rascunho, seleção, rolagem e foco preservados durante atualizações e ao recarregar;
- vocabulário de implementação removido do caminho principal;
- janela de preparação do ambiente alinhada à mesma linguagem; mínimo da janela reduzido para 720×560.

Limpeza de dívida técnica guiada por uma guarda automática contra código morto:

- `composicao-viva.test.mjs` recusa módulo ou exportação de produção alcançada apenas por teste, e recusa rota chamada pela interface que não exista no servidor;
- o controlador de formulário, o inspetor de confirmação por plataforma, o detector de página não suportada, a fronteira de confiança de página, a classificação de página de busca, a identidade da revisão, a política de ação externa, a escolha de ferramenta por contrato e a máquina de estados da candidatura entraram no caminho real;
- `llm-provider` foi removido por embutir fallback silencioso, proibido pela política de modos de IA; `mutation-runner` saiu por duplicar o registro de operações do servidor;
- memória, exceções, descoberta, acompanhamento, agenda e notificações passaram a ter autoridade única: banco local em raiz migrada, arquivo em raiz legada, nunca os dois;
- o consumo informado pelo App Server passou a alimentar o orçamento da campanha, com leitura na interface;
- as ferramentas de leitura ganharam escopo opcional, evitando trazer o estado inteiro;
- a evidência é capturada no trecho da confirmação quando a página o expõe, reduzindo dado pessoal na imagem;
- o ícone do aplicativo passou a ser gerado da própria marca, sem dependência gráfica externa;
- documentos compartilhados entre a linha principal e a linha do app têm teste de alinhamento; PRD e SDD estavam divergentes e foram reconciliados.

Correções encontradas ao auditar as marcações do checklist funcional:

- a agenda de acompanhamento gravava trabalho mas nunca disparava; agora existe executor com intervalo, deduplicação, orçamento e parada por cancelamento;
- notificações passaram a nascer de novidade observada e de ausência de adaptador, em vez de só por chamada de API;
- o orçamento derivado por tarefa filha passou a ser usado no caminho real do orquestrador;
- a consistência entre candidatura, evidência, eventos e contadores virou serviço com rota e aviso na interface.

- jornada do Autopilot conduzida pela interface com o orquestrador de produção e Chromium real em site controlado;
- pausa de especialista publicada no stream do run e respondida na própria tela, com retomada da tarefa correta;
- lacuna respondida vira fato confirmado e não é perguntada novamente em nova jornada;
- busca navega para a página de cada plataforma configurada em `<PLATAFORMA>_URL`; seleção vazia usa as plataformas habilitadas na campanha, nunca a lista completa;
- busca declarada indisponível por escopo deixa de ser tratada como falha temporária;
- revisão pré-envio mostra os campos preenchidos a partir de fatos confirmados e a variante de currículo anexada;
- painel de aprovações passa a exibir a decisão pendente logo após a solicitação;
- leitura do estado local deixa de depender do runtime de IA; consulta de status do Codex tem prazo limitado;
- falha de importação de currículo aparece na interface em vez de interromper o início em silêncio;
- abrir vaga recusa esquema não suportado em vez de fotografar a página aberta.

## P0 — consolidação do App Harness — 2026-09-04

- consolidado o App Harness como linha de produto P0 local-first e single-user;
- documentados o início local oficial, a escuta exclusiva em loopback e a separação entre código, dados privados, artefatos gerados e fixtures;
- mantida a compatibilidade com os arquivos operacionais e scripts existentes.

## 1.0.0 — 2026-09-01

Primeira versão final distribuível.

- onboarding guiado pelo chat e alternativa interativa em PowerShell;
- preflight de arquivos, perfil, currículo, campanha, plataformas e Playwright;
- metas totais e por plataforma, fila deduplicada e checkpoint;
- registro estruturado de candidaturas, eventos, testes, evidências e painel;
- playbooks para Gupy, InfoJobs, PandaPé, LinkedIn, Catho, Vagas.com e Sólides;
- proteções para questionários cronometrados e editores de código;
- importação de controles legados e seleção de currículos;
- retomada, tratamento de falhas, acompanhamento e mensagens;
- exportação sanitizada, manifesto SHA-256 e teste do ZIP distribuível.
