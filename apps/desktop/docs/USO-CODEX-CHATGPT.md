# Uso no Codex e no ChatGPT

## Codex com acesso à pasta local

1. Abra `Fluxo/` como raiz do projeto ou inicie o Codex dentro dela.
2. O Codex localizará o `AGENTS.md` antes de trabalhar e aplicará as instruções ao diretório e seus descendentes.
3. Garanta que a habilidade `$playwright` está instalada e execute `scripts/verificar-playwright.ps1`.
4. Na primeira conversa, use:

```text
Faça minha primeira configuração. Guie o onboarding pelo chat, gere os arquivos privados e execute o preflight completo antes de iniciar candidaturas.
```

5. Depois do onboarding, use:

```text
Leia perfil/candidato.md e o currículo padrão. Resuma meus cargos-alvo, filtros, riscos e metas antes de buscar ou preencher qualquer vaga.
```

A documentação oficial explica que o Codex descobre `AGENTS.md` do projeto, combina instruções da raiz até o diretório atual e dá precedência às instruções mais próximas: https://learn.chatgpt.com/docs/agent-configuration/agents-md

## ChatGPT em um Projeto

O ChatGPT sem acesso à pasta local não deve receber o `.env`. Crie um Projeto e adicione somente:

- `README.md`;
- `AGENTS.md` como referência;
- arquivos de `docs/`;
- `perfil/candidato.md` revisado;
- currículo revisado;
- controle de candidaturas sem segredos.

Copie as seções operacionais de `AGENTS.md` para as instruções do Projeto e comece com:

```text
Use os arquivos deste projeto como fontes de verdade. Não invente experiências, não exponha dados sensíveis e sempre mostre uma revisão antes de qualquer envio externo.
```

Projetos mantêm arquivos, conversas e instruções relacionados no mesmo contexto: https://learn.chatgpt.com/docs/projects

## O que nunca enviar ao ChatGPT

- `.env`;
- senhas, tokens, cookies ou códigos MFA;
- exportações de navegador;
- links privados de convites ou redefinição de senha;
- documentos pessoais que não sejam necessários para a tarefa.
