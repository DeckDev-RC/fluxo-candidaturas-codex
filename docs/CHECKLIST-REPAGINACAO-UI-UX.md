# Fluxo — repaginação completa de UI e UX

**Objetivo:** criar uma interface própria, intuitiva e coerente com um assistente que conduz a busca de emprego, organiza candidaturas e solicita apenas as decisões que dependem do candidato.

**Status:** direção **Trajetória implementada** na versão 1.2.0 e integrada aos contratos reais; **validação com pessoas ainda pendente** (U0-05, U1-01, U1-02, U2-01, U8-02 com leitor de tela e U10-01 a U10-03, U10-06).
**Complementa:** [checklist funcional da versão final](CHECKLIST-VERSAO-FINAL.md). A repaginação não substitui os requisitos de autonomia, persistência, autorização e integração real.
**Base observada:** interface da árvore `.worktrees/fluxo-desktop`, incluindo páginas web, onboarding, operação, acompanhamento e diagnóstico Electron.
**Entregáveis desta implementação:** [jornada, situações de uso e destino dos controles](../.worktrees/fluxo-desktop/docs/UX-JORNADA-E-SITUACOES.md) e [guia da direção Trajetória](../.worktrees/fluxo-desktop/docs/UX-DIRECAO-TRAJETORIA.md).
**Evidência automatizada:** 312 testes do app, 6 do desktop e 19 de navegador real, 0 falhas. Interação real da interface em `e2e/ui-experiencia.test.mjs` e `e2e/production-journey.test.mjs`.

## 1. Diagnóstico que orienta a mudança

O problema não se resume ao verde, aos cantos arredondados ou à tipografia. A composição atual repete cabeçalhos grandes, pequenas etiquetas, blocos arredondados e formulários genéricos. A navegação organiza ferramentas de implementação, e o usuário precisa entender tarefas que o assistente deveria conduzir.

| Hoje | Consequência | Direção da repaginação |
|---|---|---|
| “Operações”, “run”, “streaming” e campos de ID | O candidato precisa entender o sistema para operá-lo | Objetivo, oportunidades, decisões e candidaturas |
| Grandes títulos e introduções em toda tela | Conteúdo útil fica abaixo da primeira dobra | Cabeçalhos compactos e área de trabalho visível |
| Muitos cartões com o mesmo peso visual | Tudo compete pela atenção | Listas, separadores, agrupamento e destaque por prioridade |
| Botões de extrair, calcular e selecionar currículo | A pessoa executa a sequência técnica | Importar uma vez; revisar o entendimento e o documento escolhido |
| Timeline próxima de um log | Não fica claro o que aconteceu nem o que fazer | Atualizações de tarefa, resultado e próxima decisão |
| Login e detalhes de IA disputam a navegação | A tecnologia ocupa o lugar do objetivo profissional | Estado discreto; problema acionável quando impedir a tarefa |
| Nomes de arquivo tratados como importação concluída | A interface promete um resultado não verificado | Estado real de transferência, leitura, revisão e anexo |
| Acompanhamento como formulário de registro manual | O usuário precisa alimentar o próprio assistente | Novidades por candidatura; registro manual como complemento |

Esses problemas foram identificados na leitura do código e das telas disponíveis; ainda precisam ser confrontados com observação de candidatos usando o produto.

## 2. Experiência central

Ao abrir o Fluxo, a pessoa deve conseguir responder:

1. Qual objetivo profissional está ativo?
2. O que o Fluxo está fazendo e o que já confirmou?
3. Existe alguma decisão que precisa de mim?
4. Qual é o próximo passo das minhas candidaturas?

**Papel da conversa:** informar intenção, esclarecer lacunas e mudar preferências. Resultados, documentos, decisões e prazos precisam continuar encontráveis fora do histórico de chat.

**Papel dos agentes:** trabalhar nos bastidores com rastreabilidade. O candidato não precisa escolher o especialista nem administrar threads. “Como o Fluxo chegou aqui” pode mostrar tarefas, fontes, ações e verificações; não exige expor raciocínio interno bruto.

**Papel da interface:** tornar a automação compreensível, verificável e interrompível. A pessoa não deve precisar repetir “continue” após cada etapa que já autorizou.

## 3. Direção visual proposta — Trajetória

Proposta inicial a comparar em protótipo; nenhuma cor ou fonte está aprovada apenas por constar aqui.

**Tese visual:** uma mesa de trabalho editorial para a trajetória profissional, com superfícies claras, tipografia legível, estrutura firme e um traço de andamento que conecta etapas reais da jornada.

**Elemento de identidade:** desenvolver o nome/símbolo Fluxo a partir da ideia de percurso e passagem entre etapas. O mesmo princípio aparece no andamento da campanha, na candidatura e na transição entre seleção e detalhe. Não usar um gráfico financeiro genérico como símbolo nem transformar todo componente em ilustração de caminho.

**Composição:** navegação lateral compacta; centro dedicado à tarefa; detalhe contextual lateral somente quando necessário. Cabeçalhos curtos, listas comparáveis, alinhamentos consistentes e contraste entre trabalho ativo e histórico.

**Paleta de estudo:** branco mineral `#F4F3EF`, tinta `#20262B` e terracota `#B44832` para ações/destaques. Cores de sucesso, alerta, erro e seleção possuem funções próprias. São candidatos a tokens, sujeitos a contraste e teste; destaque da marca nunca substitui semântica de risco.

**Tipografia:** interface prioritariamente sans-serif com boa distinção entre letras e números. Uma segunda família pode aparecer pontualmente na identidade; não usar monoespaçada como linguagem principal do candidato. A escolha deve considerar licença, caracteres em português, renderização no Windows e disponibilidade offline.

**Tese de interação:** seleção abre o contexto sem perder a lista; mudanças de etapa preservam a posição da candidatura; decisões concluídas deixam uma confirmação persistente e liberam a próxima ação. Movimento curto apenas para explicar essas mudanças, com alternativa sem animação.

O visual não deve depender de grandes fotos decorativas, gradientes, vidro, sombras em todos os blocos, órbitas de IA, avatares de robô ou painéis de ficção científica. Também não basta trocar verde por outra cor e manter exatamente a mesma composição.

### Estrutura conceitual da área principal

```text
FLUXO          Objetivo: Analista de dados · remoto          2 decisões
               Estado: pesquisando nas plataformas habilitadas
Agora          ------------------------------------------------------
Oportunidades  Precisa de você                 Detalhe da decisão
Candidaturas   Revisar candidatura à Empresa A  Vaga + currículo
Meu perfil     Confirmar uma informação         Respostas revisadas
               ------------------------------------------------------
               Em andamento                    [Revisar candidatura]
               Busca · comparação · preparação
               ------------------------------------------------------
               Últimos resultados confirmados
               Empresa B · candidatura recebida · próxima ação

Configurações  Pergunte ou ajuste seu objetivo…
```

O esquema mostra prioridade e relações, não posições ou dimensões finais. Não manter coluna de detalhe vazia, não duplicar a mesma decisão em múltiplos cartões e não usar informações fictícias fora do protótipo identificado.

## 4. Arquitetura de informação proposta

| Área | Pergunta que resolve | Conteúdo principal | Ação predominante |
|---|---|---|---|
| Agora | “O que está acontecendo e o que precisa de mim?” | Objetivo ativo, decisões, trabalho em curso e resultados recentes | Iniciar, revisar ou retomar, conforme o estado |
| Oportunidades | “Quais vagas fazem sentido para mim?” | Lista comparável, filtros, motivos e descrição integral | Examinar ou ajustar seleção |
| Candidaturas | “Onde estou em cada processo?” | Histórico por vaga, situação, novidades, testes e prazos | Resolver a próxima ação daquela candidatura |
| Meu perfil | “O que o Fluxo sabe e usa sobre mim?” | Fatos confirmados, lacunas, preferências e currículos | Corrigir informação ou substituir documento |
| Decisões | “O que depende da minha autorização?” | Caixa acessível pelo indicador persistente e pela tela Agora | Revisar, responder, rejeitar ou adiar |
| Configurações e ajuda | “Como ajusto funcionamento e resolvo problemas?” | Conta, plataformas, privacidade, consumo, dados e diagnóstico | Resolver a configuração escolhida |

Decisões é uma rota própria, acessível por link/notificação; não precisa ocupar mais uma posição fixa na navegação principal. Agenda e acompanhamento ficam vinculados às candidaturas. Uma visão consolidada de próximos compromissos pode aparecer em Agora.

### Destino dos controles atuais

| Controle/área atual | Destino proposto |
|---|---|
| Fila | Oportunidades; ordenação operacional automática, edição avançada opcional |
| Extrair/calcular/selecionar currículo | Etapas internas com revisão em Meu perfil e no detalhe da vaga |
| Campos de ID | Seleção contextual da candidatura; identificador técnico somente no detalhe avançado |
| Conectar streaming | Conexão automática com reconexão visível quando falhar |
| Preflight | Preparação guiada e diagnóstico contextual |
| Aprovações | Caixa de Decisões + revisão dedicada vinculada à candidatura |
| Registrar acompanhamento | Histórico da candidatura e opção contextual de adicionar informação |
| Modelos, effort, consumo e provedor | Configurações de IA; resumo de limite apenas quando afetar a execução |
| Exportar pacote/migrar/reconciliar | Configurações → Dados e recuperação |

Nenhum recurso deve simplesmente desaparecer. Se for incorporado à automação, sua informação, controle necessário e caminho manual devem ter destino definido.

## 5. Estados que determinam a tela Agora

| Estado real | O que aparece primeiro | Ação útil | O que não deve aparecer |
|---|---|---|---|
| Primeiro uso | Objetivo e importação de currículo | Começar configuração | Dashboard vazio com números decorativos |
| Material ainda não lido | Documento e etapa atual da leitura | Aguardar, cancelar ou corrigir falha | “Currículo entendido” antes de extrair e revisar |
| Pronto para buscar | Resumo do objetivo, filtros e permissões | Iniciar busca | Formulário de cadastro manual de cada vaga |
| Trabalhando | Tarefa observável e resultados parciais | Pausar; abrir detalhe | Percentual ou tempo restante inventado |
| Decisão pendente | O que será feito, motivo da pausa e contexto | Revisar ou responder | Notificação pequena escondida no rodapé |
| Pausado pelo usuário | Ponto salvo e efeito da pausa | Retomar ou encerrar | Mensagem de erro ou pressão para continuar |
| Acesso/IA indisponível | Capacidade afetada e dados ainda acessíveis | Resolver acesso ou continuar revisão local | Spinner permanente ou falso modo automático |
| Resultado de envio incerto | Vaga, última observação e o que falta verificar | Conferir plataforma e reconciliar | Botão “Tentar novamente” que pode duplicar envio |
| Nenhuma vaga adequada | Critérios aplicados e motivos observados | Ajustar filtros, manter busca agendada ou encerrar | Promessa de contratação ou meta atingida |
| Campanha concluída | Resultados persistidos e pendências posteriores | Acompanhar ou iniciar outro objetivo | Confundir fim da busca com fim de todos os processos |

## 6. Como executar este checklist

Todos os itens começam pendentes. Para marcar conclusão, registrar tela/fluxo, commit ou versão do protótipo, evidência e resultado. Design aprovado, protótipo navegável, UI implementada e fluxo real validado são estados diferentes.

Etapas: **U0 → U1 → U2 → U3–U6 → U7–U8 → U9 → U10**. U7 e U8 começam junto dos primeiros componentes; aparecem depois para concentrar sua verificação. Protótipos podem preceder o backend; certificação funcional não pode.

### U0 — Compreender o uso e remover a lógica de ferramenta

- [x] **U0-01** Inventariar telas, controles, mensagens e tarefas atuais. **Aceite:** cada recurso tem destino na nova arquitetura ou remoção explicitamente justificada. **Evidência:** tabela “Destino de cada controle da interface anterior” em `UX-JORNADA-E-SITUACOES.md`; os módulos removidos têm função reatribuída por área.
- [x] **U0-02** Descrever três situações de uso: candidato novo, candidato acompanhando campanha e candidato resolvendo um bloqueio. **Evidência:** seção 1 de `UX-JORNADA-E-SITUACOES.md`, com necessidade, contexto, próxima ação, critério de sucesso e a tela onde acontece.
- [x] **U0-03** Mapear a jornada completa, incluindo falta de dado, negativa, indisponibilidade e interrupção. **Evidência:** seção 2 de `UX-JORNADA-E-SITUACOES.md`; nenhuma etapa exige entender agente, arquivo interno ou protocolo, e o teste de contrato recusa vocabulário de implementação em texto visível.
- [x] **U0-04** Separar trabalho automático de decisão humana. **Evidência:** seção 3 de `UX-JORNADA-E-SITUACOES.md`; a interface não tem controle para despachar especialista, e os sete portões de decisão continuam explícitos.
- [ ] **U0-05** Registrar linha de base de usabilidade nas tarefas da seção 8. **Pendente:** exige observar uma pessoa executando as tarefas.

### U1 — Identidade visual própria

- [ ] **U1-01** Comparar duas explorações visuais em telas reais: Agora e revisão de candidatura. **Pendente:** apenas a direção Trajetória foi construída, em tela real e integrada. A segunda exploração e a comparação continuam em aberto.
- [ ] **U1-02** Escolher a direção por adequação ao candidato e legibilidade. **Pendente:** o racional está em `UX-DIRECAO-TRAJETORIA.md`, mas a escolha entre direções é decisão da pessoa e não recebe rótulo de UX validada por análise própria.
- [x] **U1-03** Desenvolver assinatura visual do Fluxo: símbolo/nome, alinhamento e representação das etapas. **Evidência:** traço de percurso na marca, no `favicon.svg`, no item ativo da navegação e nos marcos do percurso da jornada. **Ícone do aplicativo concluído:** `app/scripts/build-icon.mjs` gera `build/icon.png` (256×256) com a mesma marca, sem dependência gráfica externa, e o `npm run build` gera o ícone antes de empacotar. O executável recebe o ícone com `signExecutable: false`, mantendo a distribuição sem assinatura de código.
- [x] **U1-04** Definir tokens de cor, tipografia, espaçamento, borda, elevação e movimento. **Evidência:** `app/public/styles/tokens.css` com funções semânticas separadas da cor da marca, uma única família tipográfica do sistema (offline, sem licença extra) e contraste medido por teste (`ui-design-system.test.mjs`): tinta 13,7:1, terracota 4,9:1, funções de risco entre 5,3:1 e 6,8:1, borda de controle 3,7:1.
- [x] **U1-05** Definir componentes e estados: botão, campo, lista, aba, indicador, documento, diálogo e painel de detalhe. **Evidência:** `components.css` e `core/dom.mjs`; o teste de contrato exige foco, erro, ocupado, desabilitado, seleção, alto contraste do sistema e texto longo, não só o estado ideal.
- [x] **U1-06** Submeter telas à revisão contra aparência genérica. **Evidência:** blocos usam borda em vez de sombra; o teste recusa foto e gradiente de fundo no layout; a identidade fica na composição de três faixas e no traço de percurso.

### U2 — Navegação e estrutura da aplicação

- [ ] **U2-01** Prototipar a navegação da seção 4 com nomes compreensíveis. **Implementado:** navegação com Agora, Oportunidades, Candidaturas, Meu perfil, Configurações e Ajuda, verificada pelo teste de contrato da casca. **Pendente:** o aceite exige participante encontrando sem explicação.
- [x] **U2-02** Tornar o objetivo ativo persistente e editável. **Evidência:** cabeçalho mostra o objetivo em toda tela; “Mudar objetivo” avisa que vale para as próximas buscas e não altera o trabalho já preparado nem candidaturas confirmadas.
- [x] **U2-03** Dar acesso persistente às decisões, com quantidade real e prioridade. **Evidência:** indicador no cabeçalho com contagem real, rota `#decisoes` ordenada por urgência e os mesmos itens reaproveitados na tela Agora, sem duplicar registro.
- [x] **U2-04** Implementar lista + detalhe contextual, preservando seleção, filtros e rolagem. **Evidência:** `ui/list-detail.mjs` guarda a seleção por área, o roteador restaura a rolagem da área de trabalho e abaixo de 68 rem o detalhe ocupa a página.
- [x] **U2-05** Colocar conta, suporte e diagnóstico em locais previsíveis. **Evidência:** Configurações e Ajuda no rodapé da navegação; a indisponibilidade da IA aparece também no contexto da tarefa, com ação “Resolver acesso”.
- [x] **U2-06** Tratar abertura por link, atualização de página, navegação anterior/próxima e janela desktop. **Evidência B:** `e2e/ui-experiencia.test.mjs` abre `#candidaturas` por link e recarrega mantendo o contexto; rascunho do objetivo sobrevive a repintura e a recarregar (`core/drafts.mjs`).

### U3 — Primeiro uso, objetivo e perfil

- [x] **U3-01** Criar entrada curta para objetivo em linguagem natural e importação do currículo. **Evidência:** a tela Agora no estado `primeiro-uso` pede apenas objetivo em texto livre e um arquivo; nenhum formulário extenso antecede o entendimento do produto.
- [x] **U3-02** Mostrar transferência, leitura e revisão como etapas distintas. **Evidência B:** quatro etapas em `#documento-etapas` (escolhido, transferido e verificado, lido, revisado); a jornada real espera a etapa de leitura antes de seguir, e falha de extração marca a etapa como falha preservando o arquivo.
- [x] **U3-03** Apresentar “O que entendi sobre você” com edição de fatos e origem. **Evidência B:** `e2e/ui-experiencia.test.mjs` corrige a localização pela interface; o valor passa a confirmado com origem “resposta do usuário” e sobrevive a recarregar. Nenhuma edição de Markdown.
- [x] **U3-04** Perguntar apenas lacunas necessárias à etapa atual. **Evidência B:** o Intake pergunta somente o que falta para buscar com segurança; a lacuna respondida vira fato confirmado e a jornada seguinte não repete a pergunta. Dados sensíveis ficam fora do resumo e exigem resposta explícita.
- [x] **U3-05** Revisar objetivo, filtros, plataformas, limites e permissões antes de iniciar. **Evidência:** painel “Onde vou procurar e o que preciso da sua autorização” antes do início e “Até onde o Fluxo vai sozinho” em Configurações; a política de envio aparece em texto, sem caixa pré-marcada.
- [x] **U3-06** Guiar preparação do ambiente sem conhecimento técnico. **Evidência:** Configurações mostra dependência, detalhe e ação; a janela de preparação usa a mesma linguagem, marca cada item com situação em texto e trata cancelamento como “Ação cancelada. Nada foi alterado.”
- [x] **U3-07** Permitir retomar a configuração e gerenciar variantes de currículo. **Evidência:** Meu perfil lista as variantes com verificação e origem, marca a que está em uso, avisa que a substituição não altera candidaturas já enviadas e que remover um dado não apaga histórico.

### U4 — Trabalho automático compreensível

- [x] **U4-01** Implementar as variantes da tela Agora da seção 5. **Evidência D:** `resolveNowState` cobre os 11 estados a partir do estado persistido, com 13 testes em `ui-estados-agora.test.mjs`; o texto do chat não altera a prioridade.
- [x] **U4-02** Representar a jornada em etapas úteis. **Evidência:** o percurso mostra as cinco etapas com a situação real de cada uma (não começou, em andamento, esperando você, precisa de atenção, concluída). Sem porcentagem nem tempo restante estimado.
- [x] **U4-03** Traduzir eventos técnicos em atualizações de tarefa e resultado. **Evidência:** `core/stream.mjs` converte cada evento em frase com a tarefa e a consequência; o registro técnico permanece em “Ver o trabalho dos especialistas” e na exportação de evidências.
- [x] **U4-04** Dar acesso opcional ao trabalho dos especialistas. **Evidência:** detalhe recolhido com responsabilidade, resultado e falha de cada tarefa; não há controle para gerenciar agentes nem exibição de mensagens internas.
- [x] **U4-05** Diferenciar pausar, encerrar campanha e cancelar uma tarefa. **Evidência:** “Pausar” avisa que ação externa já iniciada não é desfeita; “Encerrar campanha” interrompe tarefas filhas e preserva candidaturas confirmadas; rejeitar uma revisão não é apresentado como desfazer envio.
- [x] **U4-06** Integrar conversa ao contexto. **Evidência:** “quero apenas remoto” abre confirmação de mudança de preferência antes de alterar o perfil; pedidos de decisão, vaga, candidatura e perfil levam à área correspondente. Resultados continuam nas telas, não no histórico de conversa.

### U5 — Oportunidades e candidaturas

- [x] **U5-01** Criar lista de oportunidades com comparação útil. **Evidência:** cada linha traz cargo, empresa, local, modalidade, faixa salarial, plataforma de origem e o motivo da recomendação; dado ausente aparece como “não informado” em vez de vazio.
- [x] **U5-02** Apresentar aderência como justificativa, não promessa. **Evidência:** o rótulo diz “aderência forte/possível/fraca” com a porcentagem de requisitos coincidentes, separa requisito eliminatório em aviso próprio e o detalhe declara que não é probabilidade de contratação.
- [x] **U5-03** Oferecer filtros, ordenação e preferências com efeito previsível. **Evidência:** os filtros da lista dizem em texto que só mudam a visualização e que os critérios da campanha ficam em Configurações.
- [x] **U5-04** Criar detalhe único por candidatura. **Evidência B:** o detalhe reúne vaga, documento enviado, identificação da plataforma, evidência, histórico e próxima ação; a jornada real abre e acompanha sem digitar identificador.
- [x] **U5-05** Mostrar novidades e prazos dentro do processo correspondente. **Evidência:** cada situação tem rótulo próprio (em triagem, teste pendente, entrevista marcada, proposta recebida, encerrada pela empresa) e cada evento indica se foi observado na plataforma ou registrado por você, com a última verificação.
- [x] **U5-06** Oferecer visão consolidada de próximas ações e registro manual contextual. **Evidência:** painel “Compromissos e prazos” em Agora e “Adicionar informação que recebi” no detalhe, que grava com origem “registro manual do candidato”.

### U6 — Decisões, confiança e recuperação

- [x] **U6-01** Criar caixa de decisões por urgência e impacto. **Evidência:** `screens/decisoes.mjs` ordena aprovação, informação, bloqueio e exceção; cada item explica por que precisa da pessoa e o que acontece depois.
- [x] **U6-02** Projetar revisão pré-envio com leitura completa e ação inequívoca. **Evidência B:** o diálogo mostra empresa, cargo, plataforma, endereço, currículo anexado e cada campo preenchido; o botão é “Aprovar envio para <empresa>”, nunca um “OK” genérico.
- [x] **U6-03** Mostrar alterações posteriores à aprovação e validade da revisão. **Evidência B:** a revisão exibe até quando é válida; expirada, o botão de aprovar não aparece e a tela pede nova preparação. No backend, alterar o conteúdo depois da aprovação é recusado por hash (`scenario-matrix.test.mjs`).
- [x] **U6-04** Tornar resposta, rejeição e adiamento completos. **Evidência B:** responder uma lacuna grava e retoma a tarefa correta; aprovar executa a revisão autorizada até a confirmação, sem novo clique; rejeitar não envia e mantém a vaga na lista; o item sai da pendência e o histórico permanece.
- [x] **U6-05** Criar recuperação para resultado incerto, página alterada, sessão expirada e evidência ausente. **Evidência:** o estado `envio-incerto` explica o que falta verificar e oferece “Conferir na plataforma”, que compara a página observada sem repetir o clique. Não existe botão “Tentar novamente” capaz de duplicar envio.
- [x] **U6-06** Conduzir login/MFA/CAPTCHA pelo navegador correto. **Evidência B:** CAPTCHA na página da vaga pausa a tarefa e devolve a decisão à pessoa; o login do ChatGPT abre no navegador e a interface avisa para nunca colar senha ou código na conversa. Ajuda descreve como voltar e retomar.

### U7 — Linguagem, feedback e inclusão

- [x] **U7-01** Definir vocabulário consistente em português. **Evidência:** o teste da casca recusa `run`, `streaming`, `preflight` e `payload` no HTML servido, e o teste de contrato recusa esses termos em texto visível dos módulos. Termos técnicos sobrevivem apenas em detalhe de suporte.
- [x] **U7-02** Escrever estados vazios, erros e sucessos específicos. **Evidência B:** `core/api.mjs` traduz cada código de erro em situação, efeito e ação; os estados vazios dizem o que aparece ali e o que fazer; o indicador de ocupado sempre acompanha a tarefa em execução e um controle de pausa.
- [x] **U7-03** Tornar frescor e origem do dado compreensíveis. **Evidência:** `core/format.mjs` produz “Verificado hoje às 14h” somente com observação real e “Sem verificação registrada” quando não houve; datas em pt-BR; cada evento distingue observação da plataforma de registro manual.
- [x] **U7-04** Tratar rejeições e ausência de retorno com respeito. **Evidência:** “encerrada pela empresa” em vez de linguagem de fracasso; os blocos contam candidaturas, fila e processos, sem ranking pessoal, meta de produtividade ou comemoração desproporcional.
- [x] **U7-05** Manter feedback persistente e notificações proporcionais. **Evidência:** `ui/messages.mjs` mantém o aviso até a pessoa dispensar, agrupa repetições em 4 segundos e a repintura é adiada enquanto há digitação ou diálogo aberto.

### U8 — Acessibilidade e adaptação desktop

- [x] **U8-01** Validar contraste, foco e distinção de estados. **Evidência:** teste calcula a relação de contraste de cada par (mínimo 4,5:1 em texto e 3:1 em borda de controle) e falha se alguma cor for alterada abaixo do limite; todo indicador tem rótulo em texto, e há suporte a alto contraste do sistema.
- [ ] **U8-02** Executar os fluxos principais por teclado e leitor de tela. **Coberto:** navegação por teclado, ordem de foco, rótulos e diálogo com entrada, Escape e retorno de foco, verificados em `e2e/ui-experiencia.test.mjs`; a atualização da jornada é agrupada em `aria-live="polite"`, sem narrar cada evento. **Pendente:** verificação com leitor de tela real.
- [x] **U8-03** Testar redimensionamento da janela e ampliação de texto. **Evidência B:** teste em 1024×768, 1366×768, 1920×1080 e no equivalente a 200% de zoom, sem rolagem horizontal; verifica que a conversa não cobre a área de trabalho e que toda ação é alcançável pela rolagem. Mínimo da janela Electron reduzido para 720×560.
- [x] **U8-04** Tratar textos extensos e informação densa. **Evidência:** `overflow-wrap: anywhere` nos campos de texto livre; nenhum truncamento depende de hover; a lista usa colunas com quebra em vez de recortar nome de empresa ou cargo.
- [x] **U8-05** Implementar redução de movimento e atualização estável. **Evidência B:** com `prefers-reduced-motion` a animação de ocupado é desligada (verificado no navegador); a repintura é adiada durante digitação e diálogo, e o rascunho do objetivo é preservado.
- [x] **U8-06** Unificar janelas e superfícies desktop. **Evidência:** a janela de preparação usa os mesmos tokens, tipografia e vocabulário da interface web, com situação em texto por dependência; a seleção de arquivo e o login externo continuam nos controles nativos do sistema.

Base normativa para os itens de acessibilidade: [referência oficial WCAG 2.2 — W3C](https://www.w3.org/WAI/WCAG22/quickref/). A conformidade final depende de avaliação, não da mera presença destes itens.

### U9 — Protótipo, implementação e integração

- [ ] **U9-01** Prototipar primeiro três cenas: primeiro uso, trabalho em andamento e decisão de envio. **Situação:** as três cenas existem no aplicativo real e navegável, não em protótipo; o passo de validar a direção antes de expandir não foi cumprido na ordem prevista e depende do teste com pessoas (U10).
- [x] **U9-02** Expandir às áreas e estados, com conteúdo plausível e demonstração identificada. **Evidência B:** todas as áreas implementadas; estados de erro, espera e vazio têm texto próprio; `?demo=1` mostra aviso permanente de dados fictícios e não registra candidatura (verificado no navegador).
- [x] **U9-03** Converter o design em componentes e módulos por área, com tokens compartilhados. **Evidência:** 4 folhas de estilo com tokens, 7 módulos de núcleo, 3 de interface e 8 telas; o teste exige que a interface esteja modular e que todo módulo importado seja servido. Nenhum framework novo foi introduzido.
- [x] **U9-04** Conectar cada componente ao contrato real. **Evidência B:** a jornada completa roda contra o backend real em site controlado; nenhuma tela usa progresso, porcentagem ou sucesso fixos, e o modo demonstração é o único caminho com dados fictícios.
- [x] **U9-05** Preservar rascunhos, foco, seleção e estado ao receber eventos ou reconectar. **Evidência B:** `core/drafts.mjs` guarda o objetivo em digitação, a seleção da lista é preservada por área, o stream reconecta com espera crescente e visível, e recarregar devolve o mesmo contexto sem exigir conectar nada.
- [x] **U9-06** Incorporar conta, consumo, privacidade e recuperação de dados sem torná-los o centro do app. **Evidência:** tudo em Configurações, com a automação de IA declarando indisponibilidade e o que ainda é possível fazer; a leitura local não depende desses painéis.
- [x] **U9-07** Comparar antes/depois em fluxos equivalentes. **Evidência:** seção 5 de `UX-JORNADA-E-SITUACOES.md` compara seis fluxos; cada mudança visual vem acompanhada de redução de passo manual ou de orientação nova.

### U10 — Validação de usabilidade e aceite visual

- [ ] **U10-01** Testar o protótipo com pelo menos cinco pessoas do público-alvo. **Pendente:** exige participantes; nenhuma análise própria substitui.
- [ ] **U10-02** Aplicar as tarefas e metas da seção 8. **Pendente:** as nove tarefas estão todas alcançáveis na interface implementada, mas o tempo e o número de tentativas só se medem com pessoas.
- [ ] **U10-03** Corrigir problemas encontrados no teste com pessoas. **Pendente:** depende de U10-01 e U10-02.
- [x] **U10-04** Executar testes de interação reais no app integrado e empacotado. **Evidência B/P parcial:** `e2e/ui-experiencia.test.mjs` e `e2e/production-journey.test.mjs` clicam, digitam, importam arquivo de fora do projeto, respondem lacuna, revisam, aprovam e conferem o resultado com estado persistido; `desktop/smoke.mjs` abre o aplicativo Electron na nova interface. Os testes que apenas procuravam texto no código foram removidos. **P de instalação limpa continua pendente.**
- [x] **U10-05** Revisar telas com amostras representativas, resguardando dados pessoais. **Evidência:** capturas por estado em `output/playwright/e2e/ui-*.png` e `output/playwright/desktop/development.png`, com dados sintéticos; o teste verifica que nenhuma ação fica coberta ou fora de alcance e recusa texto de rascunho na interface.
- [ ] **U10-06** Aprovar a candidata visual com artefatos rastreáveis. **Artefatos prontos:** guia de componentes e tokens, mapa de jornada e situações, capturas por estado, lista de pendências e instalador 1.2.0 com checksum. **Pendente:** a aprovação em si, mais os resultados de usabilidade de U10-01 a U10-03.

## 7. Dependências funcionais — o design não pode fingir que existem

| Experiência proposta | Dependência no checklist funcional | Evidência que libera a UI como funcional |
|---|---|---|
| Importar currículo e revisar entendimento | F1-01 a F1-04 | Arquivo transferido/lido; fatos e correções persistidos |
| Iniciar por um objetivo e continuar sozinho | F3-01 a F3-09 | Orquestração real, eventos e limites aplicados |
| Responder decisão e voltar a trabalhar | F3-05 e F5-01 a F5-06 | Backend retoma a tarefa correta sem repetir efeito |
| Mostrar oportunidades confiáveis | F4-01, F4-02 e F4-07 | Vagas observadas, descrição/destino reais e suporte conhecido |
| Exibir confirmação de envio | F5-03 a F5-05 | Confirmação, evidência e registro da mesma candidatura |
| Novidades e agenda automáticas | F6-01 a F6-04 | Agendamento e observação externa persistidos |
| Configuração simples no computador do candidato | F7-06 e F7-07 | Instalação limpa, dependências e atualização verificadas |

Se uma dependência estiver pendente, o design pode existir como protótipo rotulado. O item de integração e o aceite de versão final permanecem pendentes. Mostrar um botão desabilitado não conclui a funcionalidade prometida.

## 8. Testes de intuitividade — tarefas e metas propostas

Metas iniciais de projeto, a calibrar com a linha de base de U0-05. Tempos excluem instalação, download, espera de IA e latência da plataforma; medem localizar/entender a ação na UI. Qualquer erro de autorização ou candidatura errada bloqueia o aceite, independentemente da média de tempo.

| Tarefa sem instrução sobre onde clicar | Meta inicial | Erro que deve ser observado |
|---|---|---|
| Explicar objetivo ativo, atividade atual e próxima ação | Pelo menos 4 de 5 participantes em até 15 segundos | Confundir planejamento com resultado confirmado |
| Encontrar e iniciar importação do currículo | Pelo menos 4 de 5 em até 30 segundos | Procurar pasta interna ou achar que nome de arquivo já é upload |
| Identificar e abrir uma decisão pendente | Pelo menos 4 de 5 em até 15 segundos | Procurar no chat, ignorar alerta ou abrir candidatura errada |
| Explicar o que será enviado antes de aprovar | Todos os participantes identificam vaga, documento e efeito | Aprovar por engano ou sem entender o destino |
| Pausar e entender o que para | Todos encontram o controle em até 10 segundos | Confundir pausa com desistência ou desfazer envio |
| Corrigir um dado do perfil | Pelo menos 4 de 5 concluem sem ajuda | Alteração não salva ou efeito sobre candidaturas desconhecido |
| Retomar após voltar ao app | Pelo menos 4 de 5 localizam contexto em até 15 segundos | Iniciar campanha duplicada ou repetir candidatura |
| Encontrar próxima ação de uma candidatura | Pelo menos 4 de 5 em até 20 segundos | Interpretar registro local como retorno confirmado da empresa |
| Entender falha de acesso ou envio incerto | Todos distinguem resolver acesso de reenviar | Clicar repetidamente, expor credencial ou duplicar envio |

Além dessas tarefas, observar esforço percebido, legibilidade, sensação de controle e confiança. Perguntar o que a pessoa espera que aconteça antes do clique; comparar a expectativa com o resultado real.

## 9. Entregáveis e condição de conclusão

| Entregável | Deve conter |
|---|---|
| Diagnóstico e mapa de jornada | Problemas atuais, tarefas, estados e destino dos recursos |
| Direção visual escolhida | Composição, identidade, tipografia, tokens e racional |
| Protótipo navegável | Primeiro uso, automação, decisões, candidatura, perfil e recuperação |
| Sistema de componentes | Estados completos, acessibilidade e comportamento responsivo |
| UI integrada | Contratos reais, eventos, persistência e comportamento desktop |
| Relatório de usabilidade | Tarefas, resultados, problemas, correções e limites da amostra |
| Evidência final | Screenshots, testes reais, versão/commit e pendências conhecidas |

**A repaginação só termina quando o candidato consegue entender, conduzir e interromper a jornada com menos esforço e quando a identidade visual funciona no produto real.** Não basta aprovar uma tela bonita nem afirmar que “agora parece premium”.

Fora do escopo automático: mudar motor de IA, remover decisões necessárias, adicionar SaaS, criar app mobile nativo, reescrever todo o backend ou obrigar tema claro/escuro duplo. Ajustes de contrato necessários à UX devem ser registrados no checklist funcional. Para o primeiro aceite, uma direção de tema completamente validada tem prioridade sobre dois temas incompletos.

## 10. Revisão de coerência realizada

| Verificação | Resultado da revisão |
|---|---|
| Identidade versus troca de paleta | Direção exige composição, percurso e linguagem próprios |
| Candidato versus operador técnico | Navegação e controles derivados das tarefas do candidato |
| IA visível versus complexidade escondida | Progresso e fontes visíveis; agentes não precisam ser administrados pelo usuário |
| Conversa versus acesso a resultados | Chat complementa; documentos, decisões e candidaturas têm lugares próprios |
| Simplicidade versus perda de controle | Pausa, consentimento, revisão e recuperação permanecem explícitos |
| UI futura versus backend atual | Dependências funcionais mapeadas e protótipos identificados |
| Aprovação versus conclusão | Decidir, enviar e confirmar são estados separados |
| Densidade versus acessibilidade | Conteúdo útil acima da dobra, com foco, zoom e detalhe acessível |
| Originalidade versus uso familiar | Identidade própria preserva convenções úteis de navegação e controles nativos |
| UX versus estética subjetiva | Tarefas e metas propostas; validação humana ainda pendente |
| Redesign completo versus reescrita indiscriminada | Inventário preserva capacidades; framework/backend não mudam só pela aparência |

Esta revisão verificou a proposta. Na versão 1.2.0 a direção Trajetória foi implementada e integrada: 56 dos 66 itens estão marcados com evidência de código, teste de domínio ou navegador real. Os 10 itens que continuam abertos dependem de pessoas — comparação e escolha de direção visual (U1-01, U1-02), linha de base e teste de usabilidade (U0-05, U2-01, U10-01 a U10-03, U10-06), leitor de tela (U8-02) e o ordenamento de validar protótipo antes de expandir (U9-01). A intuitividade continua não demonstrada: ela só se comprova observando candidatos usando o produto.
