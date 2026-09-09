# Open Source Launch Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a fronteira de origem local e preparar o Fluxo para um lançamento open source responsável, com README, contribuição e comunicação de LinkedIn prontos para revisão.

**Architecture:** A correção de segurança ficará no módulo de fronteira existente, protegida por teste de regressão. A comunicação pública será composta por documentação versionada e drafts locais; nenhuma publicação externa será feita automaticamente. O worktree `opensource/monorepo` é a base remota `main` e não mistura dados privados do checkout legado.

**Tech Stack:** JavaScript ESM, Node.js 24, `node:test`, Markdown, GitHub issue forms e CI existente.

**Spec:** Decisão aprovada em conversa: posicionar o Fluxo como aplicativo Windows local-first para candidaturas assistidas, com Playwright, aprovação humana, privacidade e convite a contribuições; não como bot autônomo ou ferramenta de spam.

## Global Constraints

- Preservar aprovação humana para ações externas sensíveis.
- Não publicar posts, criar issues ou alterar configurações externas sem confirmação separada.
- Não incluir currículos, credenciais, cookies, candidaturas, logs ou dados pessoais reais.
- Manter compatibilidade com Windows, Node.js 24, PowerShell e `node:test`.
- Não reduzir os bloqueios de CAPTCHA, MFA, shell, origem local ou conteúdo hostil.

---

### Task 1: Corrigir e cobrir a validação de origem local

**Files:**
- Modify: `apps/desktop/app/src/trust-boundary.mjs:19-23`
- Test: `apps/desktop/app/test/auth-observability.test.mjs:10-14`

**Interfaces:**
- Consumes: `assertLocalOrigin(origin)` e `isLocalRequest(request)`.
- Produces: aceitação somente de `http://localhost` ou `http://127.0.0.1`, com porta opcional, e rejeição de domínios que apenas tenham esses prefixos.

- [ ] **Step 1: Write the failing test** adicionando casos para `http://localhost.evil.test` e `http://127.0.0.1.evil.test`, que devem ser rejeitados, além de preservar as origens válidas com porta.
- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @deckdev-rc/fluxo-desktop test -- --test-name-pattern="local auth"`

Expected: FAIL porque a implementação atual usa `startsWith()`.

- [ ] **Step 3: Write minimal implementation** usando `new URL(origin)`, exigindo protocolo `http:`, hostname exatamente `localhost` ou `127.0.0.1`, e rejeitando URLs inválidas.
- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace @deckdev-rc/fluxo-desktop test -- --test-name-pattern="local auth"`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/desktop/app/src/trust-boundary.mjs apps/desktop/app/test/auth-observability.test.mjs
git commit -s -m "fix: validate exact local origins"
```

### Task 2: Tornar a entrada open source mais clara

**Files:**
- Modify: `README.md:7-20, 21-44, 91-120`
- Modify: `CONTRIBUTING.md:1-42, 72-105`
- Modify: `docs/README.md`

**Interfaces:**
- Consumes: descrição atual do produto, comandos oficiais e políticas existentes.
- Produces: proposta de valor em linguagem direta, diferenciação de bot autônomo, caminho de primeiro uso e mapa de áreas para contribuição.

- [ ] **Step 1: Reescrever a abertura do README** para responder em 30 segundos o que é, para quem serve, o que não faz e como testar em modo demo.
- [ ] **Step 2: Adicionar CTA de contribuição** com links para `CONTRIBUTING.md`, `docs/ARCHITECTURE.md`, `docs/LANCAMENTO-OPEN-SOURCE.md` e issues abertas.
- [ ] **Step 3: Acrescentar ao CONTRIBUTING** uma seção de primeiros caminhos: UI, Playwright/adaptadores, persistência, segurança, testes e documentação, cada um com comandos de validação.
- [ ] **Step 4: Atualizar o índice de documentação** com o novo kit de lançamento.
- [ ] **Step 5: Rodar validações de Markdown e testes** usando `npm test` e os testes E2E já definidos.

### Task 3: Criar o kit de lançamento e os drafts do LinkedIn

**Files:**
- Create: `docs/LANCAMENTO-OPEN-SOURCE.md`
- Modify: `ROADMAP.md` somente se a seção pública precisar apontar para o plano de comunidade.

**Interfaces:**
- Consumes: arquitetura, limitações, licença, políticas de privacidade e estado atual do repositório.
- Produces: posicionamento, público, roteiro de demo de 60–90 segundos, checklist de lançamento, quatro posts de LinkedIn e convite para contribuidores.

- [ ] **Step 1: Escrever a proposta pública** com o título “Fluxo: um cockpit local-first para candidaturas assistidas”.
- [ ] **Step 2: Documentar limites**: não contornar CAPTCHA/MFA, não prometer contratação, não enviar candidaturas indiscriminadas e não compartilhar dados reais.
- [ ] **Step 3: Criar quatro drafts**: origem do problema, demonstração, arquitetura/segurança e chamada para contribuidores.
- [ ] **Step 4: Criar o storyboard da demo** usando somente fixture sintética, mostrando onboarding, busca, revisão, aprovação e evidência.
- [ ] **Step 5: Criar checklist de publicação** para README, release, issues, LinkedIn e seção Destaques, mantendo publicação externa como passo manual aprovado pelo proprietário.

### Task 4: Revisar a entrega e validar o estado público

**Files:**
- Review: `git diff`, `README.md`, `CONTRIBUTING.md`, `docs/LANCAMENTO-OPEN-SOURCE.md` e `apps/desktop/app/src/trust-boundary.mjs`.

**Interfaces:**
- Consumes: entregas das Tasks 1–3.
- Produces: diff sanitizado e evidência de testes do `main` remoto.

- [ ] **Step 1: Verificar que nenhum arquivo privado aparece no diff**.
- [ ] **Step 2: Rodar `npm test`** e confirmar testes Node, desktop e PowerShell sem falhas.
- [ ] **Step 3: Rodar `npm run test:e2e` e `npm run test:desktop:e2e`**.
- [ ] **Step 4: Rodar `npm run test:desktop`**.
- [ ] **Step 5: Executar `git diff --check` e revisar links/caminhos públicos**.
- [ ] **Step 6: Entregar o kit para revisão do proprietário antes de qualquer push, issue ou publicação no LinkedIn**.
