# Primeiro uso e preflight

## Experiência pelo chat do Codex

Quando `perfil/candidato.md`, `campanha/config.json` ou `estado/instalacao.json` não existirem, o agente deve reconhecer a primeira utilização e iniciar o onboarding antes de buscar vagas.

O agente apresenta o objetivo do fluxo, explica quais arquivos são privados e conduz a conversa em blocos curtos:

1. **Preparação:** pedir que o usuário coloque o currículo PDF/DOCX em `curriculo/` ou informe seu caminho.
2. **Identificação:** nome, contatos, localização e links profissionais.
3. **Objetivo:** cargos, senioridade, stack, modalidades, locais, contratos, salário, disponibilidade e exclusões.
4. **Histórico:** formação, idiomas, resumo, resultados, exemplos profissionais e fatos que exigem explicação.
5. **Elegibilidade:** autorização de trabalho, viagens e respostas sensíveis somente quando o usuário desejar informar.
6. **Campanha:** meta total, diária, semanal e meta para cada plataforma.
7. **Acessos:** URLs e logins; senhas somente no `.env` local ou autenticação manual.

Ao final de cada bloco, o agente resume as respostas e permite correção. Não repete perguntas já respondidas no currículo e não infere informações sensíveis.

Depois de gerar os arquivos, o agente executa `scripts/preflight.ps1`, corrige o que estiver ao seu alcance e apresenta somente pendências que dependem do usuário.

## Alternativa pelo PowerShell

```powershell
.\scripts\primeiro-uso.ps1
```

O comando mostra o que deve ser preparado, abre o onboarding guiado e executa o preflight automaticamente. Para repetir somente a verificação:

```powershell
.\scripts\primeiro-uso.ps1 -PreflightOnly
```

## O que o preflight verifica

- integridade dos arquivos essenciais e sintaxe dos scripts;
- perfil preenchido e sem placeholders do modelo;
- ao menos um currículo PDF ou DOCX;
- `.env` local sem exibir segredos;
- campanha JSON válida e ao menos uma meta positiva;
- URLs das plataformas habilitadas;
- bases de fila e candidaturas válidas;
- `npx`, habilidade Playwright e CLI do Playwright;
- avisos de acesso quando login ou sessão autenticada ainda faltarem.

O resultado fica em `estado/preflight.md` e `estado/preflight.json`. Somente quando não houver pendência crítica, `estado/instalacao.json` marca o fluxo como pronto.
