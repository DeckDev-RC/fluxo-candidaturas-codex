# Linha oficial de produto

**Branch oficial:** `codex/fluxo-desktop`  
**Árvore de trabalho:** `.worktrees/fluxo-desktop`  
**Commit de base desta consolidação:** `6b8a620`  
**Como apontar a raiz:** a pasta `Fluxo/` em `main` preserva o pacote PowerShell e documentos locais; o aplicativo Windows, o harness e o instalador são desenvolvidos, testados e gerados em `.worktrees/fluxo-desktop`.

## Onde desenvolver, testar e gerar o instalador

| Atividade | Local |
|---|---|
| Código do app, desktop e testes | `.worktrees/fluxo-desktop` na branch `codex/fluxo-desktop` |
| Pacote PowerShell legado e docs de operação | raiz `Fluxo/` em `main` |
| Alterações locais não versionadas na raiz | permanecer na raiz; não usar `git reset --hard` |
| `npm test` | `cd .worktrees/fluxo-desktop && npm test` |
| Instalador NSIS | `cd .worktrees/fluxo-desktop && npm run build` |
| Diagnóstico | `cd .worktrees/fluxo-desktop && npm run diagnose` |

## Preservação da raiz

A raiz `main` pode conter documentos e alterações locais do usuário. Integrações da linha de produto entram pela worktree oficial. Não substituir a raiz automaticamente.

## Versão candidata

O artefato a liberar é o build gerado a partir de `codex/fluxo-desktop`, com o mesmo commit, checksum e relatório. Assinatura digital é obrigatória para distribuição pública; piloto privado sem assinatura deve ser rotulado como **piloto privado não assinado**.
