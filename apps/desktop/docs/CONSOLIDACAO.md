# Consolidação P0 + app harness

Esta linha reúne o núcleo de segurança do P0 com a interface e os serviços do
`app-harness-state-mvp`. A integração foi feita em 2026-09-04 como merge de três
versões, sem alterar os worktrees de origem.

## Proveniência

- ancestral comum e `HEAD` versionado do harness: `bb9c7c3e3198b0818dba3b6032a88c57b1c0a39b`;
- ponta P0: `4aeb62a023387ee691c8e602085e49df6b2372a5`;
- destino antes da integração: `3e6ba44f422af4d89b409f24c6022b836aab6b72`, filho do P0;
- snapshot da árvore de trabalho do harness: commit sintético local
  `f10942c47a1add4b60cc730eeb9c47a6d00aee89`, com o ancestral comum como pai.

O snapshot sintético contém somente `app/`. Ele inclui as alterações versionadas
e não versionadas que estavam presentes no worktree do harness e permite que o
commit de consolidação registre essa origem como segundo pai.

## Conteúdo integrado

A consolidação incorpora a nova interface web, janela OAuth e fixture pública;
Autopilot, memória, intake, descoberta e fit; tratamento de exceções,
acompanhamento e auditoria; contratos e orquestração dos agentes; autenticação,
catálogo e preferências do Codex; e a suíte correspondente.

Os contratos P0 continuam sendo a autoridade para estados de domínio, aprovação,
Policy Gateway e consumidores sensíveis. Em particular, o envio valida uma
aprovação vinculada à ação e ao payload antes de executar a tentativa idempotente
do navegador. Mensagens e avaliações recebem o mesmo gateway, e somente uma
autoridade humana autenticada pode decidir uma aprovação.

## Resolução dos conflitos

Quatro arquivos tiveram conflitos textuais:

- `app/README.md`: preserva o contrato de execução e acrescenta a documentação de OAuth e do painel Codex;
- `app/src/application-flow.mjs`: combina seleção/preenchimento/retry do harness com a aprovação vinculada do P0;
- `app/src/http-server.mjs`: soma serviços e rotas do harness à injeção do Policy Gateway e ao `actorResolver` do P0;
- `app/src/runtime.mjs`: compõe os novos serviços mantendo gateway, mensagens e avaliações protegidas.

Dois testes precisaram acompanhar o contrato combinado: a fixture E2E agora
declara explicitamente uma autoridade humana ao aprovar, e a lista de configuração
segura inclui os controles de modelo, nuvem e OAuth. Os testes que rejeitam
aprovação por agente ou sem autoridade foram preservados.

## Limites do snapshot

Não foram importados `.env`, credenciais, perfis, currículos, filas, candidaturas,
estado de execução, evidências, bancos, logs, dependências instaladas ou outros
dados locais. Arquivos de desktop e dependências na raiz pertencem a outra etapa
do plano e não fazem parte deste commit.

## Verificação

O comando de validação da união é executado dentro de `app/`:

```powershell
node --disable-warning=ExperimentalWarning --test
```

Na consolidação, a linha de base P0 passou com 150 testes. A suíte unificada final
contém 213 testes.
