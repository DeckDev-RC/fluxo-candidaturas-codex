# Linha oficial de produto

O repositório é um monorepo mantido na branch `main`.

## Workspaces

- `apps/desktop`: aplicativo Windows, backend, UI, navegador e testes.
- `packages/powershell`: fluxo PowerShell legado.
- `docs`: documentação pública do projeto.

## Comandos

- `npm test`: valida desktop e PowerShell.
- `npm run test:e2e`: executa navegador contra fixtures sintéticas.
- `npm run test:desktop`: smoke Electron.
- `npm run build`: gera o instalador NSIS em `apps/desktop/dist/desktop`.

## Release

O artefato deve ser gerado de uma tag limpa, com checksum, SBOM, proveniência e
relatório de testes. Releases sem assinatura Authenticode devem informar esse
fato claramente. A `v1.4.1` permanece disponível como artefato legado.
