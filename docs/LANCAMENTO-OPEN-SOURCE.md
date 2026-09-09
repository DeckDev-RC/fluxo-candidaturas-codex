# Lançamento open source do Fluxo

Este documento organiza a apresentação pública do Fluxo e serve como rascunho
de trabalho para o mantenedor. Ele não publica posts, cria issues nem altera o
perfil do autor automaticamente.

## Objetivo

Apresentar o Fluxo como uma ferramenta open source para pessoas que querem
organizar uma busca de emprego com mais contexto, memória e segurança, e convidar
outros programadores a melhorar o produto no repositório e no aplicativo.

A proposta é viável porque o projeto já tem uma base técnica pública: aplicativo
Windows em Electron, backend local, persistência SQLite, navegador integrado por
Playwright, testes automatizados, documentação de arquitetura e licença
Apache-2.0. O lançamento deve ser tratado como uma abertura gradual da
comunidade, não como promessa de automação universal para qualquer plataforma.

## Posicionamento público

### Frase curta

**Fluxo é um cockpit open source e local-first para candidaturas assistidas por
IA, com navegador, memória operacional e aprovação humana em cada ação sensível.**

### O problema

Buscar emprego envolve repetir pesquisas, comparar requisitos, preencher dados,
acompanhar retornos e lembrar o próximo passo. Essa repetição é cansativa, mas
os dados são pessoais e o envio de uma candidatura é uma decisão da pessoa.

### A solução

O Fluxo reúne perfil, currículos, oportunidades, aderência, fila, evidências e
follow-up em um aplicativo local. A IA pode conversar, organizar e preparar o
trabalho. O navegador mostra o que está acontecendo e a pessoa confirma ações
externas antes que elas aconteçam.

### O que o projeto não promete

- não é um bot autônomo de candidaturas;
- não contorna CAPTCHA, MFA, consentimento, antifraude ou termos de uso;
- não inventa experiência, formação, respostas ou evidências;
- não garante entrevista, contratação ou compatibilidade com mudanças de sites;
- não transforma currículo, cookies ou histórico em uma base SaaS centralizada.

Essa honestidade é parte do produto: confiança e contribuição sustentável valem
mais que uma demonstração que pareça mágica.

## Público prioritário

1. Desenvolvedores interessados em automação de navegador com limites claros.
2. Pessoas construindo ferramentas locais para privacidade e produtividade.
3. Contribuidores de Electron, Node.js, Playwright, SQLite e acessibilidade.
4. Profissionais em transição que querem organizar a busca sem perder a decisão.

## Demonstração recomendada

Use dados sintéticos e uma jornada curta de 60 a 90 segundos. Não grave login,
currículo real, nome de empresa real ou submissão em plataforma de terceiros.

| Tempo | Cena | Mensagem |
| --- | --- | --- |
| 0–10s | Tela inicial e título do projeto | “Um cockpit local-first para candidaturas assistidas.” |
| 10–25s | Perfil e currículo sintéticos | “O contexto fica local e fatos precisam ser confirmados.” |
| 25–40s | Busca, deduplicação e aderência | “A ferramenta organiza oportunidades e mostra lacunas.” |
| 40–55s | Navegador e revisão de formulário | “A pessoa vê a página e revisa o que será feito.” |
| 55–70s | Aprovação, evidência e histórico | “A ação sensível exige decisão humana e deixa rastreabilidade.” |
| 70–90s | README, testes e issue labels | “O código, os limites e os próximos passos estão abertos.” |

Se a demonstração for gravada, inclua uma legenda final: “Demo sintética; sem
ações externas; contribuições em github.com/DeckDev-RC/fluxo-candidaturas-codex”.

## Rascunhos para o LinkedIn

Os textos abaixo são drafts. Revise o tom, links e imagens antes de publicar.

### Post 1 — Por que existe

Estou construindo o Fluxo, um aplicativo Windows open source para organizar uma
busca de emprego com IA sem transformar candidatura em piloto automático.

Pesquisar vagas, comparar requisitos, preencher contexto e acompanhar retornos
consome energia. Ao mesmo tempo, currículo é dado pessoal e enviar uma
candidatura é uma decisão importante.

Por isso o Fluxo é local-first: reúne perfil, currículos, oportunidades, fila,
evidências e follow-up no computador da pessoa. A IA ajuda a organizar e
preparar; a pessoa continua responsável por login, CAPTCHA, MFA, consentimento
e envio.

Estou abrindo o projeto para quem quiser discutir arquitetura, melhorar a
interface, criar fixtures, fortalecer testes ou trabalhar nos adaptadores.

Repositório: https://github.com/DeckDev-RC/fluxo-candidaturas-codex

### Post 2 — A demonstração

Uma candidatura assistida não deveria ser uma caixa-preta.

No Fluxo, a jornada pode ser acompanhada: contexto confirmado, oportunidades
encontradas, aderência explicada, formulário observado, revisão humana,
aprovação e evidência local.

A demonstração usa dados sintéticos e não envia nada para uma plataforma real.
Esse detalhe é importante: o projeto não tenta burlar CAPTCHA, MFA ou regras de
sites. A meta é reduzir trabalho repetitivo mantendo a pessoa no controle.

Demo e instruções: https://github.com/DeckDev-RC/fluxo-candidaturas-codex

### Post 3 — A arquitetura

O Fluxo combina Electron, Node.js, SQLite, Playwright e dois caminhos de IA:
conversa textual isolada e operações com ferramentas de domínio restritas.

As ações externas passam por uma fronteira de aprovação que vincula a decisão ao
payload e à página observada. O agente não recebe shell, não lê credenciais e
não pode aprovar uma ação em nome da pessoa.

Ainda há muito para melhorar — especialmente adaptadores, acessibilidade,
observabilidade e documentação. É justamente por isso que o código está aberto.

Arquitetura: https://github.com/DeckDev-RC/fluxo-candidaturas-codex/blob/main/docs/ARCHITECTURE.md

### Post 4 — Convite para contribuir

O Fluxo está aberto a contribuições.

Há espaço para trabalhar em:

- UI e acessibilidade;
- adaptadores e fixtures de navegador;
- persistência local e reconciliação;
- segurança e redaction;
- testes unitários, Playwright e desktop E2E;
- documentação e experiência de contribuição.

Não é necessário começar com uma grande feature. Uma issue bem definida, uma
melhoria de teste ou uma correção de documentação já ajuda a tornar o projeto
mais confiável.

Contribuição e regras: https://github.com/DeckDev-RC/fluxo-candidaturas-codex/blob/main/CONTRIBUTING.md

## Como apresentar no perfil

No perfil do LinkedIn, prefira uma descrição objetiva no campo de projetos ou
experiência e adicione o repositório na seção de destaque. Use uma imagem da
interface com dados sintéticos, o link do GitHub e uma frase que deixe claro que
o projeto é open source e independente das plataformas e provedores citados.

Descrição sugerida:

> Fluxo — cockpit open source e local-first para candidaturas assistidas por IA.
> Electron, Node.js, SQLite e Playwright, com revisão e aprovação humana para
> ações externas.

## Convite à comunidade

O primeiro pedido ao contribuidor deve ser específico e acolhedor:

1. leia README, CONTRIBUTING, SECURITY e ARCHITECTURE;
2. rode a demo com dados sintéticos;
3. escolha uma issue `good first issue` ou `help wanted`;
4. explique no pull request o problema, a solução e a validação;
5. preserve os portões de aprovação e não inclua dados pessoais.

Frentes naturais para as primeiras contribuições:

- testes de links e documentação;
- resumo em inglês e melhorias de onboarding;
- retenção configurável e limpeza completa;
- cobertura de acessibilidade da interface;
- fixtures de plataformas, sem depender de contas reais.

Consulte as issues abertas no GitHub para não duplicar trabalho e confirme o
escopo atual antes de anunciar uma nova frente.

## Checklist antes de publicar

- [ ] revisar README, CONTRIBUTING, SECURITY e CODE_OF_CONDUCT;
- [ ] confirmar que a demo usa somente dados sintéticos;
- [ ] executar `npm test`, `npm run test:e2e`, `npm run test:desktop` e
      `npm run test:desktop:e2e`;
- [ ] revisar `git diff` em busca de currículo, token, cookie, e-mail ou URL
      privada;
- [ ] conferir notas de instalação e o SHA-256 do instalador publicado;
- [ ] publicar uma release com changelog e limitações explícitas;
- [ ] adicionar README e repositório à seção Featured do LinkedIn;
- [ ] publicar primeiro o post de contexto, depois demo, arquitetura e convite;
- [ ] responder contribuições e issues com o Código de Conduta em mente.

## Regra de publicação

Este arquivo prepara o lançamento, mas não substitui a revisão do mantenedor.
Qualquer publicação no LinkedIn, criação de issue pública ou push para `main`
deve ser uma ação explícita do proprietário, depois de revisar o texto, a mídia,
os links e o estado da release.
