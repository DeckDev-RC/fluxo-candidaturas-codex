# Privacidade

O Fluxo não possui backend SaaS próprio. Ele roda no computador da pessoa, mas
usa provedores externos de IA e as plataformas escolhidas. "Local-first" não
significa que todo processamento é offline.

## Armazenamento local

A pasta de dados pode conter:

- perfil e currículo;
- campanha, fila e candidaturas;
- conversa, runs, decisões e configurações;
- sessões isoladas do navegador;
- evidências e logs sanitizados.

Esses dados permanecem até a pessoa apagá-los. Use **Limpar conversa** para o
histórico textual. Para exclusão completa, feche o aplicativo e remova a pasta de
dados escolhida. Isso não apaga retenção já realizada por serviços externos.

## SkynetChat

Após consentimento `v1`, o Fluxo pode enviar:

- mensagem atual;
- resumo dos fatos profissionais confirmados;
- situação resumida da campanha;
- até 24 mensagens recentes.

Não envia o código de acesso, cookies ou tokens. Login e sessão ficam em processo
Electron isolado.

## ChatGPT/Codex

O Codex pode receber:

- mensagens e contexto operacional;
- resultados sanitizados de ferramentas;
- texto de currículo quando solicitado;
- snapshots e screenshots necessários para operar o navegador.

A autenticação usa o fluxo oficial do Codex local. Tokens não são copiados para
os prompts ou para arquivos do projeto.

## Plataformas de emprego

Campos confirmados são enviados à plataforma somente durante a operação
solicitada. Senhas, MFA e CAPTCHA são preenchidos diretamente pela pessoa no
navegador da plataforma.

## Telemetria

O Fluxo não envia telemetria para a DeckDev-RC. Chamadas de rede pertencem aos
provedores e plataformas habilitados pela pessoa.

## Compartilhamento de diagnóstico

Nunca publique a pasta de dados. Use somente exportações sanitizadas e revise o
arquivo antes de anexar a uma issue. Consulte `SECURITY.md`.
