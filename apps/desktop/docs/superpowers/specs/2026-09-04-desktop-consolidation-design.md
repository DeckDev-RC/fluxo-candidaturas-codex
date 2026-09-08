# Fluxo desktop — desenho aprovado

Autorização: o usuário aprovou em 2026-09-04 as seis etapas propostas na análise: consolidação, correções de browser/discovery/eventos, estados/políticas/coordenação, E2E real controlado, migração progressiva SQLite e distribuição Electron.

## Produto

Aplicativo local, single-user, Windows x64 inicialmente, com interface web existente preservada. Electron gerencia janela e processo local. Dados residem fora do instalador, no diretório de dados do usuário, com seleção/importação explícita de um pacote Fluxo existente. Sem contas reais nos testes. Sem publicação remota. O instalador local pode ser não assinado; assinatura exige certificado externo.

## Consolidação

Nova branch codex/fluxo-desktop baseada em codex/fluxo-p0-central. Integrar alterações versionadas e não versionadas do app-harness-state-mvp por comparação de três versões usando bb9c7c3 como ancestral. Preservar ambas as árvores originais. Manter API, telas, OAuth, catálogo de modelos, memória e Autopilot; preservar transições e Policy Gateway do P0. Incluir a união das suítes.

## Domínio e execução

Serviços modulares acessados por contratos; adaptadores isolam Codex, navegador, PowerShell e armazenamento. O Process Manager persiste etapa, contexto mínimo e resultado. Envio exige aprovação válida do conteúdo, observação positiva específica e evidência; resultado ambíguo pausa para reconciliação, sem novo clique automático. Eventos são associados por thread/turn até conclusão. Ferramentas de domínio não incluem shell arbitrário nem aprovação pelo agente.

## Browser

Separar driver Playwright de extração/decisões por plataforma. Contrato de observação contém URL, texto e dados estruturados. Busca extrai vagas observadas e falha explicitamente quando a página não é suportada. Testes usam servidor HTTP local e Chromium real para descoberta, preenchimento, aprovação, confirmação, screenshot, persistência, reinício e acompanhamento.

## Armazenamento

SQLite assume progressivamente autoridade de campanha, fila e candidaturas. Migração inicial idempotente, transacional, versionada e com backup dos JSONs originais. Preservar IDs, campos desconhecidos, datas, histórico e referências de evidência. Não migrar dados reais do usuário automaticamente durante desenvolvimento. JSON/Markdown tornam-se exportações de compatibilidade; mudanças externas detectadas exigem reconciliação explícita. Falha de exportação não pode duplicar envio. Segredos e arquivos binários permanecem fora do banco operacional.

## Entrega

Scripts de diagnóstico, comandos web/desktop/testes/build, instalador Windows, smoke do aplicativo empacotado e documentação de instalação, migração, backup e limitações. Dependências locais são verificadas por capacidade: leitura offline permanece disponível; automação exige navegador/Codex/PowerShell conforme uso. Nenhum recurso deve simular sucesso operacional.
