# Operação pelo agente com Playwright

## Comportamento esperado

O usuário não executa um bot separado. Ele conversa com o agente do Codex, que usa a habilidade Playwright para controlar o navegador durante a conversa.

Exemplo:

```text
Usuário: Quero 30 candidaturas remotas de backend Python na Gupy.

Agente:
1. Lê AGENTS.md, perfil/candidato.md e o currículo.
2. Confere meta, salário, senioridade e exclusões.
3. Ativa $playwright e anexa-se à sessão "candidaturas".
4. Busca e prioriza vagas.
5. Preenche os formulários no navegador.
6. Solicita ajuda somente em login, MFA, CAPTCHA ou dado ausente.
7. Confirma cada candidatura recebida pela plataforma.
8. Registra o resultado e continua até a meta ou bloqueio.
```

## Regras da sessão

- Nome padrão: valor de `PLAYWRIGHT_SESSION`, inicialmente `candidaturas`.
- Modo visual: `PLAYWRIGHT_HEADLESS=false` por padrão.
- Reutilizar autenticação existente quando permitido.
- Não fechar abas do usuário sem necessidade.
- Não salvar senhas, cookies ou storage state em arquivos compartilháveis.
- Usar snapshot antes de interagir com referências de elementos.
- Gerar novo snapshot depois de navegação ou mudança importante.
- Salvar checkpoint depois de mudança de etapa e antes de esperar o usuário.
- Usar `scripts/iniciar-sessao-playwright.ps1` somente como atalho; a decisão e a operação continuam sendo do agente no chat.

## Quando parar

- A habilidade Playwright não está disponível.
- A plataforma exige CAPTCHA, MFA ou biometria.
- Falta uma informação factual do candidato.
- A vaga exige uma resposta eliminatória não confirmada.
- A plataforma proíbe ou bloqueia a automação.
- A meta foi atingida.
- O mesmo bloqueio atingiu o limite de falhas consecutivas.

## Prompt inicial recomendado

```text
Leia o AGENTS.md, execute a validação e use obrigatoriamente a habilidade $playwright. Trabalhe comigo pelo chat, operando uma sessão persistente chamada candidaturas. Consulte meu perfil e currículo, atualize o controle após cada envio e continue até a meta configurada ou até encontrar um bloqueio real.
```

A documentação oficial da OpenAI mostra o uso de Playwright como habilidade do Codex para operar e inspecionar um navegador em execução: https://learn.chatgpt.com/pt-BR/use-cases/browser-games
