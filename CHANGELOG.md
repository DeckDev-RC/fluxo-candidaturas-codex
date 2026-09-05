# Histórico de versões

## 1.2.0 — 2026-09-05 — candidata com jornada controlada certificada

Evidência D/I/B nesta base: 276 testes do app, 6 do desktop e 12 de navegador real. Nenhuma evidência R de plataforma real; nenhum envio real autorizado.

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
