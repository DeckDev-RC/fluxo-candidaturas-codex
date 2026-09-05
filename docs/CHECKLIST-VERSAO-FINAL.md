# Fluxo — checklist de conclusão para uso real

**Objetivo:** entregar um aplicativo Windows local e individual que receba um objetivo profissional, coordene agentes reais, execute as tarefas autorizadas, solicite decisões necessárias e retome o trabalho até concluir a campanha ou explicar um bloqueio.

**Status:** candidata 1.2.0 em `codex/fluxo-desktop` com jornada controlada certificada; termo F9 ainda não preenchido.
**Código de referência:** branch `codex/fluxo-desktop`, árvore `.worktrees/fluxo-desktop`.
**Evidência D/I/B desta entrega:** 276 testes do app, 6 do desktop e 12 de navegador real, 0 falhas, reexecutados sobre o build 1.2.0.
**Artefato revisado:** `dist/desktop/Fluxo-1.2.0-Windows-x64.exe`, sha256 `b9cc41c1744d7ddb1ed5e2246eb92932cef4ae18f1ef9120c1054ab5eece2409`, não assinado, inventário em `output/build-inventory.json`.
**Ainda pendente:** evidência R de plataforma real (F9), evidência P de Windows limpo/atualização (F7-06, F7-07) e contrato do App Server com sessão autorizada (F2-02).
**Tipo de documento:** critérios de implementação, validação e liberação. Cada fase deve ser convertida em tarefas técnicas pequenas antes de alterar código.

## 1. O que significa “pronto”

“Automático” significa continuidade dentro das permissões concedidas, com limites de campanha, consumo e tentativas. Não significa inventar respostas, aprovar pelo usuário, contornar CAPTCHA/MFA, aceitar declarações pessoais ou repetir envios incertos.

A versão final é aprovada para uma combinação explícita de sistema operacional, versões de runtime e capacidades por plataforma. Não existe certificação permanente de “100% das páginas da internet”. Uma mudança de plataforma pode tornar uma capacidade indisponível; o aplicativo deve reconhecer e informar isso.

**Regra de marcação:** todos os itens abaixo começam pendentes, inclusive os que têm implementação parcial. Marcar `[x]` somente com comportamento revisado e evidência na versão candidata. A existência de classe, botão, prompt, mock ou teste que procura texto no código não comprova funcionamento real.

**Registro por item:** ID, responsável, commit/versão, evidência, resultado e limitações. Uma falha abre uma pendência vinculada ao item. Alterar código afetado invalida a evidência correspondente até nova verificação; não exige repetir testes não relacionados durante desenvolvimento.

**Níveis de evidência:** D = domínio/unitário; I = integração local; B = navegador real controlado; R = plataforma real supervisionada; P = aplicativo instalado em ambiente limpo. Um nível não substitui outro quando ambos forem exigidos.

## 2. Ponto de partida — sem confundir entrega com autonomia

| Área | Evidência disponível na base | O que ela ainda não comprova |
|---|---|---|
| Desktop e instalação | Instalador gerado; executável empacotado abriu e encerrou backend | Instalação, atualização e desinstalação em Windows limpo |
| Persistência e recuperação | SQLite progressivo, backup, reconciliação e testes locais | Todos os caminhos de campanha multiagente e recuperação combinados |
| Navegador | Fluxo real em páginas HTTP controladas | Compatibilidade com todos os formulários das plataformas |
| Autopilot | Abre thread/turn de um agente Codex com ferramentas de domínio | Delegação e coordenação de especialistas reais |
| Orquestrador | Existe e é ligado a `createFixtureAgents` | Execução multiagente de produção |
| Acompanhamento | Consulta explícita com adaptadores genéricos | Agendamento persistente e notificações confiáveis |
| Testes anteriores | Relatório de 241 testes do app, 6 do desktop e 5 de integração | Certificação da jornada autônoma em conta real |

Esta tabela descreve a entrega anterior; não representa reexecução dos testes neste checklist.

**Mudou na candidata 1.2.0:** o Autopilot passou a usar o orquestrador de produção com especialistas reais, e a jornada completa foi observada pela interface com Chromium real em site controlado (F8-02). O que continua sem evidência: plataforma real (R), Windows limpo e atualização (P) e contrato do App Server com sessão autorizada (F2-02).

Referências: [Autopilot](../.worktrees/fluxo-desktop/app/src/autopilot-service.mjs), [composição real](../.worktrees/fluxo-desktop/app/src/runtime.mjs), [ferramentas](../.worktrees/fluxo-desktop/app/src/domain-tools.mjs), [relatório anterior](../.worktrees/fluxo-desktop/docs/ENTREGA-DESKTOP.md).

## 3. Ordem e dependências

| Fase | Entrega | Depende de |
|---|---|---|
| F0 | Contrato final e linha de produto | Nenhuma |
| F1 | Dados de entrada e memória confiáveis | F0 |
| F2 | Runtime de IA e ferramentas reais | F0; usa contratos de F1 |
| F3 | Orquestrador multiagente persistente | F1 e F2 |
| F4 | Plataformas, navegação e formulários | F1 e F2; integrada com F3 |
| F5 | Aprovação, envio e recuperação completos | F3 e F4 |
| F6 | Acompanhamento agendado e experiência final | F3 e F5 |
| F7 | Integridade, privacidade e distribuição | Inicia em F0; fecha após F6 |
| F8 | Certificação controlada da jornada | F0–F7 |
| F9 | Piloto real e liberação | F8 |

F4 pode ser desenvolvida enquanto F3 avança, respeitando os contratos. F7 é requisito transversal desde a primeira alteração. Nenhum envio real é necessário para implementar ou testar F1–F8.

## 4. Fases de conclusão

### F0 — Fixar o produto e corrigir os documentos

- [x] **F0-01** Atualizar PRD e SDD para descrever autonomia supervisionada e agentes reais; resolver a contradição entre “apenas harness assistido” e “Jarvis orquestrador”. **Aceite:** documentos e interface descrevem a mesma jornada e os mesmos limites.
- [x] **F0-02** Definir a branch oficial de produto e como a raiz do projeto apontará para ela, preservando alterações locais. **Aceite:** uma pessoa identifica sem ambiguidade onde desenvolver, testar e gerar o instalador.
- [x] **F0-03** Reclassificar as marcações do plano Jarvis antigo como implementação, simulação ou validação real. **Aceite:** nenhuma marcação antiga é usada sozinha para declarar funcionalidade pronta.
- [x] **F0-04** Preencher a matriz de plataformas da seção 5. **Aceite:** capacidades obrigatórias e indisponíveis ficam explícitas; reduzir o escopo anunciado requer decisão registrada, não omissão silenciosa.
- [x] **F0-05** Fixar a política inicial: confirmação final ligada; autorizações de campanha não dispensam decisões sensíveis. **Aceite:** cada ação externa possui regra, responsável pela decisão e comportamento de pausa.
- [x] **F0-06** Fixar limites e orçamentos por campanha/run: candidaturas, falhas consecutivas, tentativas, duração e consumo. **Aceite:** valores aparecem na revisão inicial, são persistidos e respeitados por todos os agentes.

### F1 — Perfil, currículo e memória utilizáveis

- [x] **F1-01** Fazer upload/importação real de PDF/DOCX pela UI. **Aceite B/P:** selecionar arquivo fora da pasta do projeto transfere seu conteúdo; o app só anuncia importação depois de verificar arquivo e integridade. Apenas construir `curriculo/nome.pdf` não atende. **Evidência D/I:** `final-release-f1.test.mjs`. **Evidência B:** a jornada seleciona um arquivo em pasta temporária fora do projeto e confirma o conteúdo transferido em `curriculo/`; uma importação recusada agora aparece na tela em vez de interromper o início em silêncio. P de instalador ainda pendente.
- [x] **F1-02** Integrar extração de currículo ao onboarding. **Aceite I/B:** ler documentos válidos, identificar arquivo corrompido ou PDF sem texto, explicar a pendência e preservar o original. OCR só é obrigatório se anunciado como suportado.
- [x] **F1-03** Transformar texto em fatos estruturados com origem, data, confirmação e conflitos. **Aceite D/I:** lacunas e inferências nunca viram fatos confirmados automaticamente.
- [x] **F1-04** Conectar perguntas, respostas e correções à memória persistente. **Aceite B:** responder uma lacuna na UI permite continuar; reiniciar o app não repete perguntas já resolvidas. **Evidência B:** a caixa de decisões do Autopilot grava a resposta e retoma a jornada na tarefa correta; a jornada seguinte não repete a pergunta. **Evidência I:** memória sobrevive a nova instância do serviço.
- [x] **F1-05** Selecionar, anexar e registrar a variante de currículo realmente usada. **Aceite B:** arquivo anexado, hash e registro final correspondem à variante revisada; cancelar upload não gera sucesso. **Evidência I:** hash persistido; cancelamento não anuncia importação.
- [x] **F1-06** Aplicar filtros de cargo, senioridade, local, modalidade, contrato, salário e exclusões. **Aceite D/I:** requisito eliminatório impede seleção; justificativa usa fatos e descrição observados, sem inventar qualificação.

### F2 — Runtime real de IA e ferramentas completas

- [x] **F2-01** Validar login, expiração, logout e indisponibilidade do runtime configurado. **Aceite I/P:** evidência I em `runtime-health`. **Evidência B:** com o runtime de IA ausente, a leitura do estado local continua funcionando e os painéis de IA reportam indisponibilidade em prazo limitado, sem travar a interface. P de instalador limpo pendente.
- [ ] **F2-02** Validar o contrato da versão suportada do App Server: criação/retomada, ferramentas, respostas, eventos, interrupção e timeout. **Aceite I:** processo real executa ao menos uma ferramenta sem efeito externo e recebe o resultado; autenticação é do usuário de teste autorizado. **Pendente:** sessão App Server do usuário de teste.
- [x] **F2-03** Completar ferramentas necessárias à jornada, incluindo entrada de materiais, lacunas, anexos, tipos de campo, aprovação pendente, reconciliação e acompanhamento.
- [x] **F2-04** Validar entradas aninhadas e autorização no backend, inclusive enumerações, URLs, caminhos, limites e vínculo run/vaga.
- [x] **F2-05** Impedir ferramentas e permissões do runtime de contornar o gateway.
- [x] **F2-06** Fixar os modos de IA realmente suportados. **Aceite I/P:** modos `codex-app-server` e `offline-read`; P pendente.

### F3 — Orquestração multiagente de produção

- [x] **F3-01** Conectar o Autopilot ao orquestrador de produção, removendo a dependência de agentes fixture nesse caminho.
- [x] **F3-02** Implementar responsabilidades de Intake, Discovery, Fit, Application e Follow-up.
- [x] **F3-03** Persistir plano, tarefas, dependências, resultados, tentativas e vínculos campanha/run/thread/turn.
- [x] **F3-04** Implementar o ciclo observar → decidir próxima tarefa → executar → validar → persistir → continuar/replanejar.
- [x] **F3-05** Conectar eventos humanos à continuação: aprovação, rejeição, dado fornecido e autenticação concluída. **Evidência I:** rejeição não envia e não acorda duas vezes. **Evidência B:** a pausa é publicada no stream do run (`autopilot.waiting_user`), o dado fornecido na tela retoma a jornada e a revisão rejeitada não envia. Autenticação concluída depende de F2-02.
- [x] **F3-06** Separar paralelismo de raciocínio e acesso ao navegador.
- [x] **F3-07** Propagar pausa, cancelamento, orçamento e limites entre campanha e tarefas filhas.
- [x] **F3-08** Classificar erros e decidir retry, alternativa ou intervenção.
- [x] **F3-09** Distinguir conclusão de turno, tarefa, candidatura e campanha.

### F4 — Navegação e plataformas reais

- [x] **F4-01** Implementar busca por plataforma a partir dos filtros da campanha, com construção de consulta, paginação e deduplicação. **Evidência D:** `platform-search`. **Evidência B:** cada plataforma navega para a própria página de busca (`<PLATAFORMA>_URL` do `.env` ou `searchUrl` da campanha), seleção vazia usa as plataformas habilitadas em vez da lista completa, link repetido não gera vaga duplicada e busca indisponível por escopo não é tratada como falha temporária. R pendente.
- [x] **F4-02** Extrair descrição integral, empresa, identificador, requisitos e destino final. **Evidência I:** discovery normaliza origem/destino. B/R pendente.
- [x] **F4-03** Cobrir os controles anunciados: texto, seleção, checkbox, radio, datas, anexos e formulários em etapas. **Evidência D:** form-controller. **Evidência B parcial:** campos de texto preenchidos apenas com fatos confirmados; campo sem fato permanece vazio. Seleção, anexos e etapas ainda sem evidência B/R.
- [x] **F4-04** Persistir e recuperar sessão autenticada privada. **Evidência D:** session-store. B/R pendente.
- [x] **F4-05** Implementar confirmação e identificação específicas por plataforma. **Evidência D:** platform-confirmation. **Evidência B:** confirmação positiva registra a candidatura com evidência; texto negativo ou ambíguo não incrementa contagem e abre reconciliação. R pendente.
- [x] **F4-06** Tratar questionários, testes e links externos conforme as regras anunciadas. Assessment já separa estados; B/R pendente.
- [x] **F4-07** Detectar página não suportada ou DOM alterado. **Evidência D:** unsupported-page. B/R pendente.

### F5 — Aprovação, envio e recuperação sem duplicidade

- [x] **F5-01** Exibir revisão com empresa, vaga, plataforma, currículo, respostas, anexos e decisões relevantes. **Evidência B:** a preparação preenche o formulário observado com fatos confirmados e a revisão mostra cada campo e a variante de currículo anexada antes da aprovação.
- [x] **F5-02** Vincular aprovação à revisão, identidade da vaga, run e validade temporal.
- [x] **F5-03** Executar e conferir a mesma revisão aprovada. **Evidência B:** alterar o conteúdo depois da aprovação é recusado por hash; abrir outra vaga na mesma sessão bloqueia o envio por divergência de tela.
- [x] **F5-04** Recuperar interrupções em cada fronteira crítica.
- [x] **F5-05** Fechar consistência entre vaga processada, candidatura, evidência, eventos e contadores da campanha.
- [x] **F5-06** Manter uma recuperação utilizável pela UI. B/P pendente.

### F6 — Acompanhamento contínuo e experiência do candidato

- [x] **F6-01** Implementar agendamento local persistente com intervalo configurado, deduplicação e orçamento.
- [x] **F6-02** Fixar o ciclo de vida: a primeira versão agenda enquanto o processo local estiver ativo e retoma ao abrir. UI informa; sem promessa com computador desligado. P de bandeja não implementada e não anunciada.
- [x] **F6-03** Consultar status externos suportados e persistir novidades no histórico da candidatura. Ausência de adaptador não vira “nenhuma novidade”. B/R pendente.
- [x] **F6-04** Conectar notificações e próximas ações.
- [x] **F6-05** Completar mensagens a recrutadores dentro do escopo anunciado. Somente rascunho; a UI declara isso.
- [x] **F6-06** Concluir a experiência de objetivo único e caixa de decisões.
- [x] **F6-07** Sincronizar timeline e controles com estado persistido. **Evidência B:** plano, status e caixa de decisões acompanham os eventos do run pelo stream; o painel de aprovações passa a exibir a decisão pendente logo após a solicitação.

### F7 — Integridade, privacidade e distribuição

- [x] **F7-01** Garantir uma autoridade por entidade e raiz em todas as rotas, agentes e scripts.
- [x] **F7-02** Validar migração, reconciliação e rollback com backup completo recuperável. P de restauração em máquina limpa pendente.
- [x] **F7-03** Validar concorrência, troca de raiz e reinício. P pendente.
- [x] **F7-04** Rever segredos e dados pessoais em arquivos, prompts, logs, SSE, erros, screenshots e pacotes.
- [x] **F7-05** Testar fronteiras de confiança com conteúdo de vaga malicioso e chamadas não autorizadas. **Evidência B:** página com instrução hostil é lida sem expandir permissão, sem criar aprovação e sem carregar conteúdo do `.env`; identificador com esquema não suportado é recusado em vez de fotografar a página aberta.
- [ ] **F7-06** Validar ambiente limpo Windows sem ferramentas do desenvolvedor. **Pendente P.**
- [ ] **F7-07** Validar atualização e desinstalação com dados existentes. **Pendente P.**
- [x] **F7-08** Fixar versões suportadas e geração reproduzível. Inventário em `app/scripts/inventory-build.mjs`. Piloto privado deve ser rotulado não assinado. P de build limpo pendente.

### F8 — Certificação controlada da versão candidata

- [x] **F8-01** Cobrir regras de domínio e contratos dos adaptadores com testes de comportamento. 276 testes do app.
- [x] **F8-02** Executar a jornada pela UI com orquestrador e especialistas reais. **Evidência B:** `e2e/production-journey.test.mjs` conduz objetivo, importação de currículo de fora do projeto, pausa do Intake respondida na tela, busca real na plataforma configurada, aderência, revisão aprovada e envio confirmado em site controlado, com Chromium real e identidades `production:*` nos eventos do run.
- [ ] **F8-03** Executar a matriz de cenários da seção 6. **Coberto B:** especialistas reais, currículo de fora da pasta, dado ausente, aprovar/rejeitar/alterar revisão, duas tarefas em uma sessão, CAPTCHA, plataforma fora do ar, vaga duplicada, página maliciosa e URL inválida (`e2e/scenario-matrix.test.mjs`). **Pendente:** linhas P (instalação limpa, atualização e troca de pasta, falha de disco) e a linha R (jornada em plataforma real).
- [x] **F8-04** Separar ambientes fixture, integração e produção.
- [x] **F8-05** Executar campanha controlada de pelo menos 20 oportunidades com duplicatas, exclusões, aprovações e falhas, interrompendo o processo em 3 etapas diferentes. Evidência I; B pendente.
- [x] **F8-06** Registrar consumo, duração, intervenções e recuperação contra os limites de F0-06. Orçamento compartilhado; B pendente.
- [x] **F8-07** Revisar o build exato a liberar e repetir a suíte completa uma vez após as últimas correções relevantes. **Evidência:** build 1.2.0 (`Fluxo-1.2.0-Windows-x64.exe`, sha256 `b9cc41c174...ce2409`, sidecar `.sha256`), inventário de 311 arquivos de origem em `output/build-inventory.json` marcado como não assinado, smoke do empacotado e 276+6+12 testes reexecutados depois da última correção.

### F9 — Piloto supervisionado e liberação

- [ ] **F9-01** Preparar piloto com candidato, conta própria, currículo revisado, plataformas/capacidades e limites registrados. **Aceite:** autorização específica obtida antes de qualquer envio ou mensagem real. A existência deste checklist não autoriza essas ações.
- [ ] **F9-02** Validar cada capacidade obrigatória da matriz em ambiente real. **Aceite R:** login, busca, leitura, preenchimento e acompanhamento observados; ações irreversíveis somente quando houver oportunidade legítima e autorização. Evidência externa pendente continua pendente, sem marcar por simulação.
- [ ] **F9-03** Conduzir uma candidatura real autorizada de ponta a ponta por plataforma anunciada com envio automático suportado. **Aceite R:** agente/orquestrador conduzem o fluxo, usuário decide onde necessário, plataforma confirma e histórico/evidência/metas correspondem. Não usar candidatura fictícia apenas para testar produção.
- [ ] **F9-04** Confirmar retomada após uma intervenção real e acompanhamento posterior. **Aceite R:** sessão, aprovação e vínculo da candidatura são preservados; se ainda não houver retorno externo, registrar esse limite e não inventar evento para certificar a capacidade.
- [ ] **F9-05** Corrigir falhas do piloto e repetir cenários afetados, além da regressão da candidata final. **Aceite:** nenhuma falha crítica/alta aberta; limitações restantes constam na matriz, UI e notas de versão.
- [ ] **F9-06** Liberar somente após preencher o termo de aceite da seção 7. **Aceite:** artefato final rastreável, documentação atualizada, responsável pela liberação e caminhos de suporte/rollback definidos.

## 5. Matriz obrigatória de plataformas

Estado inicial: todas **não certificadas para autonomia real**. Código genérico disponível não altera esse estado.

| Plataforma | Login/sessão | Busca/leitura | Formulários/anexos | Envio/confirmação | Acompanhamento | Evidência R e versão |
|---|---|---|---|---|---|---|
| Gupy | assistida/manual | assistida/manual | assistida/manual | assistida/manual | assistida/manual | sem evidência R |
| InfoJobs | assistida/manual | assistida/manual | assistida/manual | assistida/manual | assistida/manual | sem evidência R |
| PandaPé | assistida/manual | indisponível (convite) | assistida/manual | assistida/manual | assistida/manual | busca pública não aplicável |
| LinkedIn | assistida/manual | assistida/manual | assistida/manual | assistida/manual | assistida/manual | sem evidência R |
| Catho | assistida/manual | assistida/manual | assistida/manual | assistida/manual | assistida/manual | sem evidência R |
| Vagas.com | assistida/manual | assistida/manual | assistida/manual | assistida/manual | assistida/manual | sem evidência R |
| Sólides | assistida/manual | assistida/manual | assistida/manual | assistida/manual | assistida/manual | sem evidência R |

Valores após avaliação: **certificada**, **assistida/manual**, **indisponível** ou **não aplicável com justificativa**. Plataformas por convite podem não oferecer busca pública; destino externo pode exigir outro adaptador. Registrar essas diferenças por capacidade. Se o release anunciar as sete plataformas completas, todas as capacidades aplicáveis precisam de evidência; uma edição com suporte menor exige mudança explícita de escopo em F0-04.

## 6. Cenários mínimos de aceite

| Cenário | Resultado obrigatório | Evidência |
|---|---|---|
| Instalação limpa e primeiro uso | Concluir pelo app; dependências ausentes identificadas | P |
| Objetivo + currículo → múltiplos especialistas | Delegação real observável, saídas verificadas e estado persistido | I/B |
| Currículo selecionado fora da pasta do projeto | Conteúdo importado, revisado e anexado corretamente | B/P |
| Dado ausente/conflitante | Pergunta correta, memória atualizada e continuação automática | I/B |
| Aprovar, rejeitar e alterar revisão | Só a revisão válida autorizada permite envio | D/B |
| Duas tarefas e uma sessão de navegador | Nenhuma ação na vaga errada, inclusive com mesma URL | I/B |
| Perda de rede/limite do provedor | Pausa ou retry limitado, sem fallback silencioso | I/B |
| CAPTCHA/MFA/sessão expirada | Intervenção humana e retomada da tarefa correta | B/R |
| Clique sem confirmação | Reconciliação; nenhum reenvio automático | B |
| Reinício nas fronteiras do envio | Estado/evidência coerentes e contagem exatamente uma vez | I/B |
| Cancelamento com tarefas filhas | Interromper novas ações; informar ação externa já em curso | I/B |
| Vaga duplicada ou eliminatória | Não aplicar; explicar decisão e atualizar fila | D/B/R |
| JSON divergente/banco inválido/falha de disco | Bloqueio útil, backup e recuperação sem perda silenciosa | I/P |
| App fechado, suspensão e retorno | Agenda persistida; nenhuma promessa de execução sem processo | I/P |
| Atualização e troca de pasta | Dados preservados, recursos corretos e isolamento entre raízes | P |
| Página maliciosa/URL/caminho inválido | Nenhuma expansão de permissão ou exposição de segredo | I/B |
| Jornada na plataforma real | Envio legítimo autorizado e confirmação verificável | R |

## 7. Termo de liberação

Preencher somente após F9. Estes campos vazios significam que a versão ainda não foi liberada.

| Campo | Registro |
|---|---|
| Versão / commit / checksum do instalador | Não preenchido |
| Sistemas e versões de runtime certificados | Não preenchido |
| Plataformas e capacidades certificadas | Não preenchido |
| Relatórios D/I/B/P e evidências R | Não preenchido |
| Falhas críticas/altas abertas | Não apurado |
| Limitações públicas e capacidades desabilitadas | Não preenchido |
| Backup e restauração testados | Não preenchido |
| Assinatura / distribuição privada ou pública | Não preenchido |
| Responsável, data e decisão de liberação | Não preenchido |

**Regra final:** não anunciar “Jarvis multiagente pronto” enquanto F3, F8-02 e os critérios reais aplicáveis de F9 estiverem pendentes. “Testes passando”, “instalador gerado” e “thread do Codex iniciada” não são equivalentes à jornada certificada.

## 8. Revisão de coerência deste checklist

Revisão editorial/técnica realizada na criação; não é aprovação do produto.

| Ponto revisado | Resultado |
|---|---|
| Escopo antigo versus objetivo Jarvis | F0 exige alinhamento antes da implementação |
| Código existente versus requisitos pendentes | Baseline separado; nenhum item da liberação pré-marcado |
| Simulação versus agentes/sites reais | F2, F3, F8 e F9 têm evidências distintas |
| Ordem e dependências | Contratos antes da integração; piloto somente após certificação controlada |
| Automação versus decisões humanas | Continuidade automática com limites; decisões pessoais continuam explícitas |
| Concorrência versus navegador compartilhado | Dono exclusivo de sessão e cancelamento de tarefas filhas exigidos |
| Envio versus falha/retomada | Reconciliação e idempotência em cada fronteira, incluindo evidência |
| Todas as plataformas versus release menor | Matriz impede reduzir cobertura ou marcar não aplicável silenciosamente |
| Banco versus scripts legados | Autoridade única e compatibilidade verificadas em todas as rotas |
| Segundo plano versus aplicativo fechado | Processo ativo e retomada definidos; serviço extra não presumido |
| Critérios mensuráveis versus “100%” | Resultados observáveis e cenários definidos; sem promessa universal |
| Escopo técnico necessário | Não exige microserviços, reescrita total, TypeScript ou normalização completa do SQLite para liberar |
| Artefato testado versus entregue | F8-07 vincula commit, build, checksum e relatório |

Revisar novamente se mudar o contrato do produto, a lista de plataformas, o provedor/runtime de IA ou a política de autonomia. Não adicionar funcionalidades à versão final sem atualizar dependências e critérios de aceite.
