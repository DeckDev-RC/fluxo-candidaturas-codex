# PRD — App Harness do Fluxo de Candidaturas

**Status:** contrato da versão candidata 1.2
**Jornada:** autonomia supervisionada com especialistas reais
**Documentos alinhados:** [SDD](SDD-APP-HARNESS.md), [política](POLITICA-AUTONOMIA.md), [limites](LIMITES-CAMPANHA.md), [matriz](MATRIZ-PLATAFORMAS.md), [linha de produto](LINHA-DE-PRODUTO.md)

O Fluxo é um aplicativo Windows local e individual. O candidato informa um objetivo profissional. O Autopilot coordena especialistas reais de Intake, Discovery, Fit, Application e Follow-up, executa as tarefas autorizadas, pede decisões necessárias e retoma até concluir a campanha ou explicar um bloqueio.

“Automático” significa continuidade dentro das permissões, com limites de campanha, consumo e tentativas. Não significa inventar respostas, aprovar pelo usuário, contornar CAPTCHA/MFA, aceitar declarações pessoais ou repetir envios incertos. A interface e este PRD descrevem a mesma jornada e os mesmos limites.

A versão candidata **não certifica autonomia real** nas sete plataformas. O escopo anunciado é assistido/manual, conforme a matriz. Mensagens a recrutadores são rascunho. A agenda funciona só com o aplicativo aberto.

> Histórico 1.1.0: Electron, Playwright direto e SQLite progressivo. Consulte [arquitetura implementada](ARQUITETURA-IMPLEMENTADA.md) e [contrato desktop](DESKTOP.md).


**Status:** rascunho para implementação
**Versão:** 0.3
**Escopo:** exclusivamente o pacote `Fluxo/`
**Fonte de requisitos:** [`README.md`](../README.md), arquivo de instruções do agente e documentação operacional em `docs/`

## 1. Resumo

O App Harness é a camada local do Autopilot: orquestra especialistas reais, persiste a jornada em SQLite, pede confirmação humana nos portões e continua a campanha sem exigir um comando por etapa. JSON legado só entra por migração explícita. O produto não é um bot que aprova ou envia sozinho.

## 2. Problema

O pacote atual já define onboarding, metas, fila, candidatura, questionários, checkpoint, acompanhamento e segurança, mas a operação está distribuída entre:

- instruções do agente no arquivo de configuração do pacote;
- scripts PowerShell;
- arquivos JSON e Markdown;
- conversa do Codex;
- sessão persistente do Playwright.

Isso dificulta visualizar o estado da campanha, recuperar uma execução interrompida, revisar o que será enviado e distinguir uma ação confirmada de uma tentativa incompleta.

## 3. Objetivos do MVP

1. Exibir o estado do preflight, onboarding, campanha, fila e checkpoint.
2. Conduzir a primeira configuração em blocos curtos.
3. Permitir definir metas e filtros por plataforma, respeitando `config/plataformas.json` e `.env`.
4. Mostrar a fila deduplicada e a próxima ação recomendada.
5. Abrir uma execução de candidatura com progresso em tempo real, associada a uma vaga reivindicada.
6. Parar em portões de confirmação, MFA, CAPTCHA, biometria, dado ausente ou bloqueio de plataforma.
7. Registrar candidatura somente após confirmação visual de recebimento; uma tentativa, rascunho ou falha não conta para a meta.
8. Manter histórico, evidências, falhas e próxima ação.
9. Retomar uma execução sem confiar na memória da conversa.
10. Gerar painel e exportação compartilhável sanitizada.

## 4. Não objetivos do MVP

- substituir o navegador ou a habilidade Playwright;
- contornar CAPTCHA, MFA, biometria, fiscalização ou termos das plataformas;
- enviar candidatura sem autorização configurada e sem atender os portões sensíveis;
- armazenar senha, token, cookie ou código MFA em banco, Markdown ou log;
- criar uma operação SaaS multiusuário;
- compartilhar um login entre candidatos;
- converter o fluxo em bot externo independente do Codex;
- garantir contratação ou resposta das plataformas;
- alterar silenciosamente o perfil, currículo, histórico ou metas;
- remover os scripts atuais antes de haver paridade funcional.

## 5. Usuários e papéis

### Candidato

Pessoa que fornece perfil, currículo, preferências e confirma decisões pessoais, legais, sensíveis e envios.

### Operador do fluxo

No MVP é o próprio candidato ou o agente trabalhando em seu nome. Pode executar busca, triagem, preenchimento factual e registros permitidos.

### Administrador futuro

Papel fora do MVP, reservado para equipes que precisem gerenciar múltiplos candidatos, políticas e auditoria.

## 6. Princípios

- O candidato é a fonte final para fatos pessoais e decisões sensíveis.
- O currículo e `perfil/candidato.md` são fontes de verdade; o modelo não inventa dados.
- O navegador é necessário para ações web e confirmação visual.
- Toda ação externa importante tem um portão explícito.
- O estado persistido prevalece sobre a memória da conversa.
- Uma tentativa não é uma candidatura enviada.
- Cada candidatura deve ser auditável e retomável.
- O app deve continuar funcionando mesmo quando a IA estiver indisponível para leitura local e revisão manual.

## 7. Fluxo principal

```text
primeiro uso
  → onboarding
  → preflight aprovado
  → campanha e metas
  → busca e fila
  → seleção por aderência
  → preenchimento no navegador
  → revisão pré-envio
  → confirmação do usuário
  → envio e confirmação visual
  → registro/evidência
  → acompanhamento
  → retomada ou encerramento
```

## 8. Requisitos funcionais

### RF-01 — Diagnóstico e primeiro uso

O app deve ler o estado de instalação sem exibir segredos, informar pendências e conduzir o onboarding definido em [`PRIMEIRO-USO.md`](./PRIMEIRO-USO.md). Nenhuma busca ou candidatura pode começar com pendência crítica de preflight.

### RF-02 — Perfil e currículo

O app deve indicar a presença do perfil e do currículo, acionar `extrair-curriculo.ps1` quando necessário e mostrar quais informações estão confirmadas, ausentes ou conflitantes. O conteúdo privado não deve ser incluído em exportações compartilháveis.

### RF-03 — Campanha e limites

O usuário deve configurar período, metas total/diária/semanal, metas por plataforma, cargos, senioridade, stack, modalidade, local, contrato, salário mínimo e exclusões. O app deve exibir e respeitar `MAX_APPLICATIONS_PER_RUN`, `MAX_CONSECUTIVE_FAILURES`, `CHECKPOINT_AFTER_EACH_ACTION`, `EVIDENCE_MODE` e os limites de confirmação definidos no `.env`.

### RF-04 — Fila de vagas

O app deve permitir adicionar vaga, calcular aderência como apoio, atribuir prioridade `A/B/C`, deduplicar por `key` e por impressão digital empresa+cargo, indicar prazo, tentativas e erro e permitir duplicidade entre plataformas somente por decisão explícita.

### RF-05 — Próxima ação

O app deve apresentar a próxima vaga elegível respeitando aderência, prioridade, prazo, saldo de meta, falhas e limites da campanha. O claim deve ser persistido antes da execução.

### RF-06 — Execução no navegador

O agente deve usar a sessão persistente `candidaturas`, snapshots antes de interações e novo snapshot após mudanças relevantes, conforme [`PLAYWRIGHT.md`](./PLAYWRIGHT.md). O app deve exibir plataforma, URL, etapa atual e progresso, sem capturar segredos ou conteúdo sensível desnecessário.

### RF-07 — Portões de segurança

O app deve pausar e pedir intervenção em login, MFA, CAPTCHA, biometria, consentimento, dado sensível, resposta eliminatória não confirmada, teste cronometrado ou ação proibida pela plataforma. `REQUIRE_FINAL_CONFIRMATION=true` deve ser o padrão do primeiro uso; `ALLOW_AUTOMATED_SUBMISSION` nunca deve dispensar decisões sensíveis ou legais.

### RF-08 — Revisão pré-envio

Antes do envio, o app deve mostrar empresa, cargo, plataforma, URL/ID, currículo anexado, respostas, salário, modalidade, anexos, dados sensíveis e eventuais redirecionamentos.

### RF-09 — Confirmação e registro

Só registrar status enviado quando houver confirmação visual da plataforma e evidência associada. O registro deve preservar identificador, data, status, próxima ação, currículo usado, teste, evidência, origem e histórico. O harness não deve confiar apenas no exit code do navegador ou do script.

### RF-10 — Questionários e testes

O app deve mostrar tipo, duração, cronômetro, regras, possibilidade de pausa e autoria exigida antes de iniciar. Testes psicométricos, comportamentais, de identidade ou fiscalizados exigem participação direta do candidato.

### RF-11 — Acompanhamento

O app deve listar mensagens, entrevistas, testes, prazos, rejeições, propostas e vagas sem retorno. A lista local não substitui a verificação real no navegador.

### RF-12 — Retomada e falha

O app deve salvar checkpoint em mudanças de etapa, antes de esperar o usuário e após confirmação. Falhas repetidas devem ser registradas; a execução não pode repetir cegamente a mesma ação. Ao retomar, a tela atual confirmada prevalece sobre o checkpoint antigo.

### RF-13 — Mensagens

O app pode gerar rascunhos para recrutadores, mas o envio exige revisão e confirmação separadas.

### RF-14 — Painel e exportação

O app deve gerar o painel operacional e permitir exportar somente artefatos sanitizados, sem `.env`, perfil real, currículo, fila, campanha, evidências ou mensagens privadas.

## 9. Estados

### Instalação

`not_configured → onboarding → preflight_pending → ready`

Estados de exceção: `blocked` e `needs_user_input`.

### Vaga na fila

Estados persistidos compatíveis com os scripts atuais: `na fila → em andamento → processada | bloqueada`. O harness pode usar estados internos (`claimed`, `failed`, `paused`), mas deve mapear o resultado para os valores existentes na exportação.

### Candidatura

Estados compatíveis com o pacote atual:

`rascunho`, `pronta para revisão`, `enviada`, `triagem`, `teste pendente`, `teste concluído`, `entrevista`, `proposta`, `rejeitada`, `desistência`, `encerrada`.

Uma candidatura só pode avançar para `enviada` depois de confirmação visual e registro da evidência.

## 10. Critérios de aceite do MVP

- O primeiro uso não permite iniciar campanha antes do preflight aprovado.
- O app consegue retomar campanha, fila e checkpoint existentes.
- Uma vaga duplicada não cria novo item.
- Uma candidatura sem confirmação visual não conta para a meta.
- Uma ação sensível sempre mostra resumo antes da execução.
- CAPTCHA, MFA, biometria e teste fiscalizado pausam o fluxo.
- Uma falha persistida permite seguir para outra vaga segura.
- O painel reflete os arquivos estruturados após cada confirmação.
- A exportação não contém segredos nem dados privados.
- Uma retomada compara checkpoint com a tela atual antes de continuar.
- O claim de uma vaga incrementa tentativas e salva checkpoint com plataforma, URL e chave.
- Vagas sem meta habilitada na campanha não são escolhidas pela próxima ação.
- A divergência entre meta total e soma das metas por plataforma é exibida, nunca ocultada.
- A execução para ao atingir `MAX_APPLICATIONS_PER_RUN` ou `MAX_CONSECUTIVE_FAILURES` conforme configurado.
- `EVIDENCE_MODE=confirmation` exige evidência de confirmação antes do status enviado.

## 11. Métricas

- tempo até preflight aprovado;
- tempo até primeira candidatura confirmada;
- candidaturas confirmadas por plataforma;
- taxa de duplicatas e falhas;
- taxa de bloqueios por motivo;
- tempo médio de retomada;
- tarefas pendentes por prazo;
- percentual de registros com evidência;
- erros de preenchimento detectados na revisão;
- integridade da exportação compartilhável.

## 12. Segurança e riscos

O comportamento deve seguir [`SEGURANCA.md`](./SEGURANCA.md): segredos somente localmente, sem exposição em logs, chat, Markdown ou ZIP; nenhuma automação para burlar controles; confirmação final habilitada por padrão.

Principais riscos: sessão expirada, mudança de DOM, duplicidade, redirecionamento de plataforma, dado pessoal incorreto, perda de checkpoint e inconsistência entre arquivo e tela. O SDD define as barreiras técnicas.

## 13. Dependências e limites conhecidos

- Node.js 24+/npm e Playwright CLI precisam estar disponíveis para o preflight.
- A habilidade Playwright continua sendo uma dependência do agente; o app não a substitui.
- O usuário precisa realizar login manual, MFA, CAPTCHA e biometria quando exigidos.
- As plataformas podem alterar interface, regras ou bloquear automação.
- O primeiro release não deve prometer execução em segundo plano quando o host local estiver fechado.

## 14. Roadmap

### Fase 1 — Harness local

Leitura do preflight, painel, fila, checkpoint, aprovação, eventos e integração com os scripts existentes.

### Fase 2 — Operação integrada

Onboarding visual, execução Playwright com streaming, acompanhamento, mensagens, questionários e exportação pelo app. A implementação atual entrega esta fase em modo local/fixture, com confirmação humana e sem envio real nos testes.

### Fase 3 — Evolução

Migração gradual da lógica PowerShell para serviços tipados, cofre de credenciais, múltiplos usuários e sincronização somente após revisão de segurança.

## 15. Decisões em aberto

- O SQLite será somente projeção no primeiro release; a migração de autoridade dos JSONs exige plano e rollback.
- O App Server será iniciado por `stdio` local ou por socket local na instalação alvo?
- O painel será somente leitura no primeiro release ou terá mutações completas para todos os scripts?
- Como a sessão Playwright será descoberta e anexada pela interface?
- Quais eventos de acompanhamento serão importados primeiro?
