# Fluxo desktop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** entregar as seis etapas solicitadas pelo usuário, com app consolidado, execução verificável, SQLite progressivo e instalador Electron.
**Architecture:** monólito modular local, adaptadores, estados explícitos e Process Manager persistente.
**Tech Stack:** Node.js 24+, JavaScript ESM, SQLite, Playwright, Electron e PowerShell.
**Spec:** docs/superpowers/specs/2026-09-04-desktop-consolidation-design.md

## Global Constraints

- Trabalhar somente na nova árvore fluxo-desktop. Preservar as duas árvores de origem e dados reais.
- Backend loopback, sessão/CSRF e Policy Gateway continuam obrigatórios; o agente não decide aprovações.
- Testes usam dados temporários e páginas controladas, sem contas reais.
- Estados ambíguos de envio exigem reconciliação, nunca repetição cega.
- Node API e UI existentes devem continuar funcionando; nenhum framework novo é necessário para a consolidação.
- Executar testes focados RED/GREEN para cada comportamento e suíte consolidada após integração.

## Task 1: Consolidação das duas linhas

- [x] Comparar app-harness-state-mvp (incluindo não versionados) contra ancestral bb9c7c3 e P0 4aeb62a. Integrar app/ via merge de três versões; não copiar dados privados ou outputs.
- [x] Preservar os avanços P0 em app/src/domain, policy, approval, application-flow, run e serviços consumidores; incorporar UI, Autopilot, OAuth, memória e demais serviços do harness.
- [x] Resolver conflitos de testes preservando comportamento; rodar `node --disable-warning=ExperimentalWarning --test` em app/. Falhas da união são regressões a resolver, sem enfraquecer aprovações para fazer testes antigos passarem.
- [x] Registrar proveniência em docs/CONSOLIDACAO.md; commit de integração.

## Task 2: Browser, descoberta e eventos

- [x] Adicionar regressões em test/browser-confirmation.test.mjs: negação não confirma; confirmação de outra vaga não confirma; envio ambíguo não repete clique; screenshot precisa existir.
- [x] Em agent-adapter/stdio transport testar evento após resposta de turn/start e duas threads concorrentes. Associar por IDs persistentes, tratar conclusão/erro/interrupção e chamadas do servidor.
- [x] Em playwright driver/discovery criar observação coerente e extração real de links/vagas. Testar snapshot sem jobs, dados estruturados, página não suportada, erro de processo e URL.
- [x] Implementar adaptadores de plataforma e contratos para follow-up observado. Browser real de teste será validado na tarefa 4.
- [x] Rodar testes focados e suíte completa; commit.

## Task 3: Coordenação persistente

- [x] Centralizar estados de run/fila/candidatura/aprovação, preservando estados terminais e avanços Autopilot.
- [x] Criar process-manager com preparar, aprovar, enviar, confirmar, registrar, pausar, retomar, reconciliar; persistir contexto e observação.
- [x] Testar reinício após confirmação externa e antes do registro local: `submitClicks === 1` após recuperação; aprovação expirada/conteúdo alterado bloqueiam; pausa impede envio.
- [x] Conectar API e Autopilot à coordenação; ferramentas de domínio registradas explicitamente com validação e sem ferramenta de decisão de aprovação.
- [x] Corrigir propagação de estados/eventos para UI e preservar recursos anteriores; commit com suíte.

## Task 4: Navegador real controlado

- [x] Adicionar servidor de páginas controladas com busca, detalhes, formulário, confirmação, negativa e acompanhamento.
- [x] Executar Chromium real via Playwright, usando runtime e browser adapters reais: perfil/campanha, descoberta, shortlist, aprovação, preenchimento, envio, screenshot e histórico.
- [x] Validar rejeição de negativa, pausa/retomada, reload/reinício e acompanhamento. Asserções no DOM e dados persistidos, sem substituto do browser.
- [x] Salvar screenshot de evidência e relatório reproduzível em output/ ignorado; `npm run test:e2e`; commit.

## Task 5: Autoridade SQLite progressiva

- [x] Criar repositório operacional SQLite e migrações versionadas. Testes: importar fixture JSON com IDs/datas/campos extras/histórico/evidências intactos; repetir migração não duplica; inválido faz rollback sem apagar fonte.
- [x] Roteamento por autoridade explícita: instalação nova em SQLite; instalação legada pode migrar com comando/ação explícita após backup. UI e serviços lêem autoridade selecionada.
- [x] Campanha/fila/candidaturas mutam transacionalmente no banco; relatórios e JSON são exportações. Scripts legados passam por adapter de compatibilidade e reconciliação, sem segunda autoridade silenciosa.
- [x] Testar mudança externa de JSON, falha de exportação, reinício, lock órfão e rollback documentado; commit com suíte e E2E.

## Task 6: Desktop e distribuição

- [x] Adicionar Electron main/preload e backend supervisionado. Renderer sem Node; APIs de desktop limitadas; dados fora da instalação. Testar inicialização, fechamento, offline e falhas de dependência.
- [x] Criar diagnóstico estruturado por capacidade e tela de instalação/configuração com seleção de diretório. Verificar Node/PowerShell/Codex/browser sem imprimir segredos.
- [x] Configurar dependências fixadas, build e instalador Windows x64. Empacotar somente fontes públicas e scripts; excluir fixtures, credenciais e dados privados.
- [x] Executar suíte, E2E, build e smoke do binário empacotado; documentar assinatura ausente e dependências externas quando aplicável.
- [x] Atualizar README, PRD/SDD e instruções de instalação, migração/rollback, diagnóstico e comandos. Revisão final e commit.

## Verificação da entrega

Ver docs/ENTREGA-DESKTOP.md para evidências, limites e artefatos. O instalador foi gerado e o executável empacotado foi testado nesta máquina Windows, usando dados temporários; não houve validação em VM limpa nem plataformas externas reais.
