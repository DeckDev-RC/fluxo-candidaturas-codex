# Instruções para agentes no monorepo

## Escopo

- `apps/desktop/`: aplicativo Electron e runtime Node.
- `packages/powershell/`: pacote legado PowerShell.
- `docs/` e arquivos raiz: documentação pública e governança.

Leia o `AGENTS.md` mais próximo do arquivo alterado. Instruções específicas
prevalecem dentro de cada workspace.

## Regras gerais

- Use somente dados e contas sintéticas em testes.
- Nunca leia, registre ou versione `.env`, credenciais, cookies, currículo,
  perfil, candidatura, evidência ou estado local.
- Não reduza portões de aprovação humana.
- Não contorne CAPTCHA, MFA, fiscalização ou antiautomação.
- Não anuncie autonomia sem evidência reproduzível.
- Prefira módulos pequenos, soluções simples e testes com `node:test`.
- Considere Windows, desenvolvimento, teste e produção.

## Validação

```powershell
npm test
npm run test:e2e
npm run test:desktop
```

Mudanças precisam respeitar Apache-2.0, DCO, `CONTRIBUTING.md`,
`SECURITY.md` e `CODE_OF_CONDUCT.md`.
