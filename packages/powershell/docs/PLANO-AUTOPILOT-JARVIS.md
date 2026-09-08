# Plano de metas — Autopilot JARVIS do Fluxo

**Reclassificação F0-03:** as marcações `[x]` abaixo são **implementação ou simulação** do plano antigo. Nenhuma delas, sozinha, declara funcionalidade pronta para autonomia real. A evidência válida está no [checklist de versão final](CHECKLIST-VERSAO-FINAL.md) e nos testes da branch `codex/fluxo-desktop`.

**Escopo:** evolução do App Harness dentro de `Fluxo/`.

**Objetivo:** transformar o Fluxo de um painel de ferramentas em um assistente pessoal que recebe um objetivo profissional, entende o contexto, planeja, executa a jornada e acompanha os processos com o mínimo de intervenção manual.

## 1. Norte do produto

> “Encontre e conduza as melhores oportunidades para mim.”

O usuário informa apenas o objetivo, preferências essenciais e os materiais disponíveis. A IA deve conduzir descoberta, extração, análise, preparação, execução, registro e acompanhamento. A interface deve mostrar o que a IA entendeu, o que está fazendo, o que concluiu e qual exceção precisa de atenção.

### Critérios de sucesso do produto

- [x] Um usuário novo inicia a primeira execução sem conhecer JSON, scripts, IDs ou a estrutura de pastas.
- [x] O usuário consegue descrever seu objetivo em linguagem natural.
- [x] A IA cria um plano observável e o executa em segundo plano.
- [x] A IA reutiliza perfil, currículo, respostas e histórico sem pedir os mesmos dados novamente.
- [x] A IA busca, compara e prioriza oportunidades sem exigir cadastro manual de cada vaga.
- [x] A IA conduz a candidatura usando o navegador e registra o resultado confirmado.
- [x] O usuário vê uma timeline compreensível em vez de logs técnicos.
- [x] O usuário só precisa intervir quando há uma exceção ou uma decisão que realmente exige contexto pessoal.

## 2. Pesquisa e decisões de inspiração

As referências não devem ser copiadas visualmente. Elas orientam comportamento, arquitetura e sensação de produto:

- [OpenJarvis](https://github.com/open-jarvis/OpenJarvis): referência para local-first, memória, skills e agentes sob demanda, agendados e contínuos.
- [OpenAI Computer-Using Agent](https://openai.com/index/computer-using-agent/): referência para percepção visual, planejamento, ações na GUI e autocorreção.
- [Claude Computer Use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool): referência para o loop observe → tool call → resultado → próxima ação e para a execução em ambiente controlado.
- [Browser Use](https://github.com/browser-use/browser-use): referência para instruções em linguagem natural, extração de dados e preenchimento de candidaturas no navegador.
- [Skyvern](https://www.skyvern.com/docs/developers/getting-started/introduction): referência para Screenshot → DOM → LLM → ação → validação do objetivo, workflows e livestream.
- [MultiOn](https://docs.multion.ai/welcome): referência para separar coleta/raciocínio de execução web, manter sessões e executar tarefas em paralelo.
- [Manus Agents](https://open.manus.ai/docs/v2/agents-overview): referência para agente coordenador, subtarefas e execução longa.

### Síntese aplicada ao Fluxo

- [x] A IA é o produto visível; Playwright, scripts e APIs são ferramentas internas.
- [x] O sistema trabalha por objetivos, planos, tarefas e resultados — não por telas técnicas.
- [x] Toda ação importante produz uma observação, um evento e uma explicação curta.
- [x] O sistema valida o resultado antes de avançar ou declarar sucesso.
- [x] O usuário pode acompanhar a execução, mas não precisa conduzir cada passo.

## 3. Identidade JARVIS do Fluxo

### Meta

Criar a sensação de um copiloto pessoal presente, proativo e confiável, sem transformar a interface em uma HUD decorativa.

### Checklist

- [x] Nomear a experiência principal como **Autopilot do Fluxo**.
- [x] Usar linguagem de agente: “entendi”, “estou pesquisando”, “encontrei”, “preparei”, “preciso de você”.
- [x] Exibir uma única intenção principal na entrada, por exemplo: “O que você quer alcançar?”.
- [x] Mostrar memória ativa: objetivo, currículo selecionado, preferências e última execução.
- [x] Exibir plano, progresso, decisões e exceções em uma timeline de leitura humana.
- [x] Diferenciar claramente: pensando, executando, validando, concluído, aguardando e falhou.
- [x] Criar identidade visual própria com um motivo de “fluxo/sinal”: marca, linha de progresso e estados coerentes.
- [x] Evitar mosaico de cards, dashboards genéricos, texto de marketing e logs crus na experiência principal.

### Critérios de aceite

- [x] Em cinco segundos, o usuário sabe quem conduz a tarefa.
- [x] Em qualquer tela, a pergunta “o que a IA está fazendo?” tem resposta visível.
- [x] Nenhuma ação essencial depende de descobrir qual formulário abrir.

## 4. Entrada mínima e onboarding conduzido pela IA

### Meta

Trocar o formulário longo por uma conversa guiada e uma coleta automática de contexto.

### Checklist

- [x] Criar entrada inicial de objetivo profissional em texto livre.
- [x] Permitir importar currículo, documentos e respostas existentes de uma vez.
- [x] Extrair automaticamente nome, contatos, cargos, senioridade, competências, formação, idiomas e preferências.
- [x] Apresentar um resumo do que a IA entendeu antes de gravar.
- [x] Perguntar somente lacunas que impedem a próxima etapa.
- [x] Aceitar respostas curtas, seleção visual, arquivo local e texto livre.
- [x] Inferir plataformas, localidades, modalidade e filtros a partir do contexto quando possível.
- [x] Salvar rascunho, memória e estado de coleta localmente.
- [x] Permitir corrigir qualquer fato extraído sem reiniciar o onboarding.
- [x] Concluir onboarding com uma frase de confirmação e o plano inicial da IA.

### Metas mensuráveis

- [x] Primeira configuração concluída em até 5 minutos com currículo disponível.
- [x] No máximo 5 perguntas obrigatórias antes da primeira busca.
- [x] Zero exigências de JSON, caminho técnico ou comando no caminho principal.
- [x] 100% dos fatos não sensíveis usados em candidatura exibidos para correção antes da primeira execução; dados sensíveis ficam sob controle explícito.

## 5. Memória pessoal e contexto operacional

### Meta

Fazer a IA lembrar do usuário e do estado da campanha sem repetir perguntas ou perder o ponto de retomada.

### Checklist

- [x] Criar memória estruturada do perfil com origem e data de cada fato.
- [x] Armazenar variantes de currículo e currículo escolhido por objetivo.
- [x] Armazenar respostas recorrentes, preferências, exclusões e filtros.
- [x] Associar cada execução a objetivo, plano, vaga, plataforma, evidências e eventos.
- [x] Reutilizar contexto entre candidaturas sem copiar dados manualmente.
- [x] Permitir ao usuário editar, excluir ou substituir qualquer memória.
- [x] Criar resumo de contexto que o agente recebe antes de cada tarefa.
- [x] Retomar uma execução interrompida a partir do último estado verificável.

### Critérios de aceite

- [x] A segunda candidatura não pede novamente dados já confirmados.
- [x] Uma reinicialização do app recupera plano, run, checkpoint e pendências.
- [x] Toda memória possui origem legível e não expõe segredos na interface.

## 6. Orquestrador e loop de agente

### Meta

Criar o núcleo que transforma uma intenção em plano, coordena especialistas e continua até concluir ou encontrar uma exceção.

### Loop obrigatório

```text
entender objetivo
  → consultar memória
  → criar plano
  → escolher ferramenta/agente
  → observar resultado
  → validar objetivo
  → persistir evento e memória
  → continuar, corrigir ou pedir intervenção
```

### Checklist

- [x] Criar `Autopilot Orchestrator` como dono do plano e do estado da jornada.
- [x] Dividir tarefas em agentes especializados: Intake, Discovery, Fit, Application e Follow-up.
- [x] Definir contratos de entrada/saída para cada agente.
- [x] Fazer o agente escolher entre arquivo local, API, script, Playwright e App Server.
- [x] Permitir subtarefas sem perder o run principal.
- [x] Persistir plano, tarefa atual, observação, ferramenta usada e resultado.
- [x] Adicionar retries limitados e autocorreção orientada pela última observação.
- [x] Validar o objetivo depois de cada mutação de navegador.
- [x] Encerrar a execução somente com resultado confirmado ou exceção explícita.
- [x] Publicar eventos de progresso em até 500 ms após recebê-los.

### Critérios de aceite

- [x] O Autopilot retorna ao usuário rapidamente e continua em segundo plano.
- [x] Uma falha de uma subtarefa não apaga o plano nem o histórico.
- [x] O agente sabe explicar a próxima ação em uma frase.

## 7. Descoberta e coleta automática de vagas

### Meta

Eliminar a necessidade de cadastrar vagas uma a uma.

### Checklist

- [x] Criar tarefa de descoberta a partir de cargo, local, modalidade, salário, senioridade e exclusões.
- [x] Usar Playwright para navegar nas plataformas configuradas.
- [x] Extrair título, empresa, local, modalidade, salário, requisitos, URL/ID e prazo.
- [x] Normalizar os dados para um contrato comum de vaga.
- [x] Deduplicar por identificador e impressão digital de empresa/cargo.
- [x] Registrar origem, horário da coleta e evidência de observação.
- [x] Recalcular a fila automaticamente após nova coleta.
- [x] Permitir descoberta incremental e agendada.
- [x] Mostrar “encontrei X oportunidades” em vez de expor requisições técnicas.

### Metas mensuráveis

- [x] Uma ordem de descoberta produz oportunidades sem cadastro manual.
- [x] 100% das vagas coletadas têm origem e timestamp.
- [x] Duplicatas não chegam à etapa de candidatura.
- [x] A coleta consegue retomar após uma plataforma indisponível.

## 8. Aderência, seleção e decisão da IA

### Meta

Fazer a IA transformar muitas vagas em uma shortlist explicada e acionável.

### Checklist

- [x] Comparar requisitos da vaga com fatos do currículo e memória.
- [x] Separar requisitos atendidos, lacunas e requisitos eliminatórios.
- [x] Classificar aderência em forte, possível e fraca.
- [x] Explicar a classificação em linguagem simples.
- [x] Priorizar por aderência, interesse, prazo, duplicidade e esforço estimado.
- [x] Aplicar limites de campanha e por execução automaticamente.
- [x] Permitir corrigir a decisão da IA e registrar o motivo.
- [x] Enviar somente oportunidades elegíveis para a etapa de candidatura.

### Critérios de aceite

- [x] Cada vaga shortlistada possui justificativa e score rastreável.
- [x] O usuário não precisa abrir a descrição completa para saber por que uma vaga foi escolhida.
- [x] Uma vaga fraca não é preparada sem uma decisão explícita do usuário.

## 9. Execução de candidatura pelo navegador

### Meta

Fazer a IA conduzir a candidatura de ponta a ponta usando a sessão Playwright, sem transformar o usuário em operador de formulário.

### Checklist

- [x] Criar tarefa de candidatura com vaga, perfil, currículo e respostas disponíveis.
- [x] Abrir a plataforma pela sessão persistente correta.
- [x] Fazer snapshot antes de cada interação relevante.
- [x] Interpretar a tela por DOM, texto e evidência visual.
- [x] Preencher campos com fatos confirmados e respostas contextualizadas.
- [x] Validar cada etapa após alteração.
- [x] Capturar snapshot/evidência após alterações relevantes e após confirmação.
- [x] Registrar plataforma final, URL, ID e status real.
- [x] Retentar quando a falha for recuperável sem duplicar a candidatura.
- [x] Atualizar fila, candidatura, checkpoint e timeline automaticamente.

### Critérios de aceite

- [x] O usuário não precisa copiar IDs entre telas.
- [x] Uma candidatura só aparece como concluída após confirmação observada.
- [x] Uma mudança de DOM não causa preenchimento cego: o agente reobserva e decide.

## 10. Exceções e atenção do usuário

### Meta

Fazer o usuário participar somente quando a IA não consegue continuar sozinha ou precisa de uma informação pessoal.

### Checklist

- [x] Criar uma caixa de exceções prioritárias.
- [x] Classificar exceção por tipo, urgência, run, plataforma e ação sugerida.
- [x] Explicar o problema em linguagem humana, sem stack trace.
- [x] Permitir responder à exceção no mesmo contexto da tarefa.
- [x] Retomar automaticamente após a resposta.
- [x] Mostrar quando a IA perdeu acesso, sessão, página ou evidência.
- [x] Representar pausa, divergência, reconciliação, MFA, CAPTCHA e dado ausente.
- [x] Manter a tarefa pausada sem perder o plano.

### Critérios de aceite

- [x] Toda interrupção informa por que ocorreu e o que desbloqueia a execução.
- [x] O usuário não precisa descobrir sozinho qual tela ou arquivo corrigir.
- [x] Após resolver uma exceção, a IA retoma do ponto correto.

## 11. Acompanhamento autônomo

### Meta

Fazer a IA continuar trabalhando depois da candidatura, monitorando processos e trazendo apenas eventos relevantes.

### Checklist

- [x] Criar monitor por candidatura e plataforma.
- [x] Consultar status, mensagens, entrevistas, testes, prazos e convites.
- [x] Diferenciar evento novo de estado já conhecido.
- [x] Registrar timeline com origem e evidência.
- [x] Criar próxima ação sugerida por candidatura.
- [x] Criar lembretes e tarefas com prazo.
- [x] Resumir mudanças desde a última consulta.
- [x] Permitir instruções em linguagem natural, por exemplo: “acompanhe tudo desta semana”.
- [x] Mostrar alertas de alta prioridade no Autopilot.

### Metas mensuráveis

- [x] Nenhum evento novo é perdido entre duas consultas.
- [x] Cada alerta possui candidatura, origem, data e próxima ação.
- [x] O usuário consegue entender o estado de um processo sem abrir a plataforma.

## 12. Interface principal do Autopilot

### Meta

A interface deve parecer uma conversa operacional com um agente presente, não um painel administrativo.

### Estrutura da tela inicial

- [x] Saudação e estado do agente.
- [x] Entrada de intenção.
- [x] Resumo do que a IA sabe.
- [x] Plano atual com progresso.
- [x] Timeline de eventos traduzidos.
- [x] Resultados e oportunidades encontradas.
- [x] Caixa de exceções.
- [x] Ações rápidas: pausar, retomar, mudar objetivo e ver evidências.

### Checklist de interação

- [x] Tornar “Iniciar Autopilot” a ação primária.
- [x] Substituir formulários manuais por coleta progressiva quando houver contexto suficiente.
- [x] Manter controles avançados escondidos até serem necessários.
- [x] Mostrar progresso vivo sem exigir abrir a tela de streaming.
- [x] Permitir pausar e retomar sem perder contexto.
- [x] Mostrar resultados em linguagem de decisão, não em JSON.
- [x] Criar estados vazios que expliquem o próximo passo da IA.
- [x] Criar modo demonstração com fixture para cada etapa.
- [x] Garantir teclado, mobile, contraste e foco visível.

## 13. Evidências, confiança e rastreabilidade

### Meta

Permitir que o usuário entenda o que a IA fez e reconstrua qualquer candidatura sem expor segredos.

### Checklist

- [x] Registrar cada tarefa, ferramenta, observação e resultado.
- [x] Associar screenshots, hashes, URL, timestamp e origem às ações relevantes.
- [x] Mostrar resumo de evidência na timeline.
- [x] Mostrar diff quando o estado observado divergir do esperado.
- [x] Redigir tokens, cookies, senhas e dados sensíveis desnecessários.
- [x] Manter backup, hash pré/pós-operação e checkpoint.
- [x] Permitir exportar um pacote auditável e sanitizado.
- [x] Exibir claramente o nível de confiança e o motivo de uma decisão da IA.

### Critérios de aceite

- [x] Toda candidatura confirmada tem evidência verificável.
- [x] Nenhum segredo aparece na timeline, fixture ou exportação compartilhável.
- [x] Uma ação divergente é bloqueada ou enviada para exceção antes de continuar.

## 14. Execução local e modelos

### Meta

Manter a experiência local-first, permitindo que a inteligência opere com modelo local ou provedor configurado sem mudar a interface.

### Checklist

- [x] Definir contrato único de LLM para o orquestrador.
- [x] Permitir App Server local como transporte principal do agente.
- [x] Permitir modelo local compatível quando disponível.
- [x] Isolar credenciais, cookies e sessões fora do contexto de UI.
- [x] Exibir estado de modelo, navegador e conectores sem expor segredos.
- [x] Usar cloud somente quando configurado explicitamente.
- [x] Fallback para leitura local e retomada quando IA ou internet estiver indisponível.
- [x] Medir latência, custo, tokens, energia quando o modelo fornecer esses dados.

## 15. Observabilidade e avaliação do agente

### Meta

Medir se o Autopilot realmente reduz trabalho, melhora qualidade e conclui tarefas.

### Checklist

- [x] Medir tempo da intenção até o primeiro resultado útil.
- [x] Medir tempo até primeira candidatura confirmada.
- [x] Medir tarefas concluídas sem intervenção.
- [x] Medir intervenções por tipo de exceção.
- [x] Medir taxa de sucesso, retry, duplicidade, bloqueio e reconciliação.
- [x] Medir qualidade da coleta e precisão da aderência.
- [x] Medir tempo de retomada após pausa/falha.
- [x] Criar traces sanitizados por run.
- [x] Criar conjunto de fixtures por plataforma e tipo de formulário.
- [x] Rodar avaliação regressiva antes de alterar prompts, skills ou adaptadores.

### Metas iniciais

- [x] 80% das tarefas de coleta de fixture concluídas sem intervenção.
- [x] 90% das transições simuladas validadas pelo estado observado.
- [x] 100% das falhas críticas geram evento, contexto e ação de recuperação.

## 16. Testes e definição de pronto

### Checklist TDD

- [x] Cada novo comportamento começa com teste RED.
- [x] O teste falha pela ausência do comportamento, não por erro de setup.
- [x] A implementação mínima deixa o teste GREEN.
- [x] A refatoração mantém a suíte verde.
- [x] Cada agente e adaptador possui testes de contrato.

### Checklist E2E com fixture

- [x] Importar currículo e iniciar Autopilot.
- [x] Completar coleta de perfil com perguntas mínimas.
- [x] Executar descoberta simulada.
- [x] Exibir shortlist e justificativa de aderência.
- [x] Preparar candidatura simulada.
- [x] Preencher formulário simulado via Playwright.
- [x] Detectar mudança de tela e replanejar.
- [x] Gerar evidência e confirmação simulada.
- [x] Atualizar candidatura e timeline.
- [x] Criar e resolver uma exceção.
- [x] Pausar, recarregar e retomar o run.
- [x] Acompanhar evento de entrevista/teste simulado.
- [x] Verificar que nenhuma ação externa real foi executada.

### Definição de pronto do Autopilot

- [x] Uma única intenção inicia a jornada.
- [x] O plano aparece antes da execução.
- [x] O progresso aparece enquanto a IA trabalha.
- [x] A IA usa memória e não repete perguntas resolvidas.
- [x] A coleta e a seleção funcionam sem cadastro manual de cada vaga.
- [x] A candidatura é preparada e validada no navegador.
- [x] As exceções são acionáveis e retomáveis.
- [x] O acompanhamento continua após a candidatura.
- [x] As evidências são verificáveis e sanitizadas.
- [x] Fixtures cobrem o fluxo completo.
- [x] A suíte automatizada está verde.

## Ordem recomendada de implementação

1. Autopilot como tela inicial e entrada de intenção.
2. Contrato do orquestrador, plano, eventos e memória de run.
3. Intake com importação de currículo e perguntas por lacuna.
4. Discovery com coleta Playwright e fila automática.
5. Fit/shortlist com justificativa.
6. Application Agent ligado ao navegador e à evidência.
7. Caixa de exceções e retomada.
8. Follow-up contínuo e timeline unificada.
9. Modelos local/cloud, observabilidade e avaliação.
10. E2E completo com fixtures por plataforma.

## Regra de produto

Se uma nova funcionalidade fizer o usuário operar manualmente uma ferramenta que a IA poderia conduzir com contexto suficiente, ela deve ser tratada como regressão de UX e reavaliada antes de entrar no caminho principal.

## Registro de execução

- [x] Bloco inicial do Autopilot implementado: intenção, currículo opcional, plano, timeline e status.
- [x] Integração local criada: run, thread e turn do App Server.
- [x] Execução assíncrona implementada e coberta por teste.
- [x] Modo fixture criado e validado no navegador.
- [x] Itens marcados acima foram revisados e confirmados por testes automatizados e smoke Playwright.
- [x] Memória segura, intake progressivo, importação de materiais, origem/data e correção de fatos implementados.
- [x] Discovery normalizado com adapters Playwright/fixture, deduplicação, evidência, retomada e shortlist explicável.
- [x] Contratos dos agentes Intake, Discovery, Fit, Application e Follow-up implementados com orquestração e subtarefas persistidas.
- [x] Exceções acionáveis com pausa, resposta e retomada; acompanhamento idempotente com alertas e próximas ações.
- [x] Trace sanitizado por run, hashes, confiança e exportação auditável implementados.
- [x] Contrato LLM local/cloud com fallback seguro e configuração sem credenciais expostas implementado.
- [x] E2E fixture completo executado sem ação externa real; suíte final: 192 testes, 0 falhas.
- [x] Login ChatGPT/Codex por OAuth integrado ao App Server local, sem API key no processo do agente.
- [x] Control Center do Codex implementado: account, uso, limites, catálogo de modelos, effort e aplicação no próximo turn.
- [x] Login do app-server usa `account/login/start` com OAuth browser/device code e só exibe instruções seguras.
