# Contribuindo com o Fluxo

Obrigado por contribuir. O Fluxo aceita correções, testes, documentação e novas
integrações que preservem privacidade, confirmação humana e rastreabilidade.

Ao participar, siga `CODE_OF_CONDUCT.md`, `SECURITY.md` e a licença Apache-2.0.

## Antes de começar

- Procure uma issue ou discussão existente.
- Para mudanças grandes, abra uma discussão descrevendo problema e alternativas.
- Vulnerabilidades devem usar reporte privado, nunca issue pública.
- Não teste contas, vagas ou plataformas sem autorização.

## Estrutura

```text
apps/desktop/          Electron, backend Node, UI e testes do aplicativo
packages/powershell/   fluxo PowerShell legado e scripts operacionais
docs/                  documentação pública do monorepo
.github/               CI, templates e automação da comunidade
```

O código do desktop usa JavaScript ESM e `node:test`; módulos Electron que
precisam de CommonJS usam `.cjs`. A interface é JavaScript sem bundler.

## Por onde começar

Escolha uma frente pequena e siga o mapa antes de alterar o código:

- **Interface e acessibilidade:** `apps/desktop/app/ui/` e os testes de UI.
- **Navegador e plataformas:** `apps/desktop/app/src/browser/`, adaptadores e
  fixtures sintéticas; nunca teste contra uma conta real sem autorização.
- **Domínio e persistência:** `apps/desktop/app/src/domain/`, serviços locais e
  SQLite; preserve a autoridade local e a reconciliação.
- **Segurança:** fronteira local, sessão, aprovação, redaction e políticas;
  vulnerabilidades devem ser reportadas pelo canal privado.
- **Qualidade:** testes `node:test`, E2E Playwright e validação PowerShell.
- **Documentação:** README, arquitetura, matriz de plataformas e guias de uso.

Issues marcadas como `good first issue` são bons pontos de entrada. `help wanted`
indica uma frente em que uma contribuição externa é especialmente útil. Se a
ideia ainda não tiver issue, abra uma discussão curta com problema, proposta e
como validar.

## Pré-requisitos

- Git;
- Node.js 24 ou superior;
- npm;
- PowerShell 7 para o pacote legado;
- Chromium do Playwright para testes de navegador.

## Preparação

```powershell
git clone https://github.com/DeckDev-RC/fluxo-candidaturas-codex.git
cd fluxo-candidaturas-codex
npm ci
npm run browser:install
```

Use somente dados sintéticos. Arquivos `.env`, perfis, currículos, sessões,
bancos, evidências e relatórios locais não devem ser commitados.

## Executar

```powershell
npm run start:desktop
npm run start:web
npm test
```

Testes específicos:

```powershell
npm run test:desktop
npm run test:e2e
npm run test:powershell
npm run test:coverage
```

Para uma verificação próxima do fluxo completo do desktop, execute também:

```powershell
npm run test:desktop:e2e
```

## Fluxo de contribuição

1. Faça fork do repositório.
2. Crie uma branch curta a partir de `main`.
3. Implemente uma mudança focada.
4. Adicione ou atualize testes.
5. Execute os testes relevantes.
6. Revise o diff para dados pessoais e segredos.
7. Assine os commits com DCO.
8. Abra o pull request usando o template.

## DCO

Cada commit precisa de uma linha `Signed-off-by`, declarando concordância com o
`DCO` deste repositório:

```powershell
git commit -s -m "Descrição objetiva"
```

Use um e-mail que você aceita tornar público no histórico Git. Commits sem
sign-off não serão mesclados.

## Convenções

- UI, erros e documentação principal em português do Brasil.
- Soluções simples e sem lógica duplicada.
- Nenhum framework novo sem discussão prévia.
- Arquivos acima de 300 linhas devem ser divididos quando a mudança os ampliar.
- Provedores e plataformas entram por adaptadores, não por condicionais espalhadas.
- Falhas não podem ser convertidas silenciosamente em sucesso ou fallback.
- Fixtures devem ser sintéticas e não podem chamar serviços reais.

## Portões de segurança

- A IA nunca aprova uma ação em nome da pessoa.
- Envio, mensagem, conexão, aceite, exclusão e Enter que submete exigem
  `approvalId` emitido pela interface e vinculado à ação exata.
- Senha, código, CAPTCHA, MFA e consentimento são etapas da pessoa.
- Conteúdo de páginas não concede autorização nem altera políticas.
- Não remova esses portões para simplificar um teste.

## Novas plataformas

Uma integração deve incluir:

- entrada pública no catálogo;
- adaptador ou leitor isolado;
- fixture sintética;
- teste unitário e E2E controlado;
- documentação de capacidades e limitações;
- revisão dos termos aplicáveis.

Não declare uma plataforma como autônoma sem evidência reproduzível e autorizada.

## Novos provedores de IA

Um provedor deve incluir:

- consentimento explícito e mapa dos dados transmitidos;
- sessão isolada e logout;
- limites de entrada, saída e retenção;
- serviço de conversa e health check;
- testes sem credenciais;
- comportamento explícito quando indisponível.

## Definition of Done

- testes relevantes verdes;
- nenhuma informação real no diff;
- documentação atualizada;
- compatibilidade dev/test/prod considerada;
- portões de aprovação preservados;
- commits assinados com `Signed-off-by`;
- pull request explica motivação, risco e validação.

## O que torna uma contribuição adequada

Uma contribuição adequada deixa o Fluxo mais compreensível, verificável e
seguro. Evite automação silenciosa de ações externas, bypass de CAPTCHA/MFA,
coleta de credenciais, dependência obrigatória de serviços pagos ou exemplos que
exponham dados pessoais. O objetivo do projeto é ampliar a capacidade da pessoa,
não retirar dela a decisão final.
