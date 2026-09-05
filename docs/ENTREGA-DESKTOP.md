# Entrega Fluxo Desktop

## Candidata 1.2.0 — jornada controlada certificada (2026-09-05)

| Verificação | Resultado |
|---|---|
| Testes do app | 312 aprovados, 0 falhas |
| Testes da infraestrutura desktop | 6 aprovados, 0 falhas |
| E2E Chromium real (jornada, matriz de cenários, experiência de UI e preflight) | 19 aprovados, 0 falhas |
| Desktop empacotado (smoke) | Abriu, leu offline, isolou renderer, preservou dados e encerrou o backend |
| Instalador | `dist/desktop/Fluxo-1.2.0-Windows-x64.exe`, sha256 `9be704bad238b400403c081a8571d230b61a1dd396a390c941f7912a591d23da`, **não assinado** |
| Inventário do build | `output/build-inventory.json`, 334 arquivos de origem, sem `.env` e sem bancos operacionais |

**Certificado nesta candidata (evidência B, site controlado):** jornada do Autopilot conduzida pela interface com o orquestrador de produção; importação de currículo de fora do projeto; pausa de especialista respondida na tela e retomada na tarefa correta; busca na página configurada de cada plataforma; revisão com campos preenchidos e currículo anexado; aprovação humana obrigatória; envio confirmado com evidência e registro em SQLite; recusa de revisão alterada, CAPTCHA, plataforma fora do ar, vaga duplicada e página hostil.

**Não certificado:** qualquer plataforma real (sem evidência R), instalação/atualização em Windows limpo (sem evidência P) e contrato do App Server com sessão autorizada (F2-02). Esta candidata **não autoriza envio real**.

## Entrega anterior — 1.1.0

## Resultado das seis etapas

1. Consolidação por merge de três versões: P0 + alterações versionadas/não versionadas do harness, preservando as árvores de origem. Registro em `CONSOLIDACAO.md`.
2. Confirmação negativa/ambígua corrigida; extração de vagas observadas com falha explícita em páginas não suportadas; eventos associados por thread/turn/run, inclusive após resposta inicial.
3. Estados e políticas conectados aos serviços; coordenação persistida, retomada, idempotência e registro após confirmação sem repetir o clique. Ferramentas de domínio registradas, sem decisão de aprovação pelo agente. Revisão vinculada à vaga/página/formulário.
4. Chromium real em páginas HTTP controladas: onboarding, fila, aderência, aprovação, preenchimento, envio, screenshot, SQLite, reinício, acompanhamento e navegação da interface. Casos negativos não contam para metas.
5. SQLite progressivo como autoridade de campanha/fila/candidaturas, com backup, migração explícita, rollback, preservação de campos legados e divergência bloqueante. Ponte PowerShell isolada validada com scripts reais; locks órfãos recuperáveis.
6. Electron Windows x64, processo local supervisionado, dados externos à instalação, diagnóstico por capacidade, instalação de Chromium e instalador NSIS gerado.

## Evidência executada

| Verificação | Resultado |
|---|---|
| Testes do app | 241 aprovados, 0 falhas |
| Testes da infraestrutura desktop | 6 aprovados, 0 falhas |
| E2E Chromium + preflight PowerShell | 5 aprovados, 0 falhas |
| Autoteste PowerShell legado | Aprovado em raiz temporária |
| Desktop em desenvolvimento | Abertura, isolamento, diagnóstico, instalação de navegador, preservação e encerramento aprovados |
| Desktop empacotado | Mesmas verificações aprovadas no executável gerado |
| Migração / rollback / remigração | Estado preservado na verificação local |
| Conteúdo do pacote | Sem `.env`, perfil real, auth.json ou bancos operacionais |
| Instalador | NSIS Windows x64 gerado, assinatura `NotSigned` |

Logs e screenshots: `output/final-tests.log`, `output/final-e2e.log`, `output/desktop-installer-final.log`, `output/playwright/e2e/`, `output/playwright/desktop/`.

A revisão independente identificou problemas de ciclo de turno, associação de página, evidência após reinício e reabertura do navegador. Todos receberam correções e regressões. Uma segunda revisão confirmou três e apontou uma proteção adicional de SPA; o teste dessa proteção falhou antes da correção e passou depois.

## Artefatos

- `dist/desktop/Fluxo-1.1.0-Windows-x64.exe`: instalador local.
- `dist/desktop/Fluxo-1.1.0-Windows-x64.exe.sha256`: checksum.
- `dist/desktop/win-unpacked/Fluxo.exe`: aplicativo desempacotado testado.
- `docs/DESKTOP.md`: uso, migração, recuperação e diagnóstico.

## Limites verificados

Não houve candidaturas ou login em contas reais. A cobertura de plataformas é baseada em observações/JSON-LD e interrompe páginas não reconhecidas; não certifica todos os DOMs reais. Codex CLI, PowerShell 7 e download do Chromium são dependências explícitas. O App Server permanece uma integração experimental. A validação foi feita nesta máquina Windows com diretórios novos de dados; não foi realizada em uma VM de Windows limpa. O instalador não possui certificado de assinatura digital.

A branch entregue é `codex/fluxo-desktop`, na árvore `.worktrees/fluxo-desktop`. Não houve push, publicação ou substituição da raiz original com alterações do usuário.
