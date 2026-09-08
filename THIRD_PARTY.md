# Integrações e terceiros

O Fluxo é independente e não é afiliado, patrocinado ou endossado pelos
fornecedores citados.

## Provedores de IA

### ChatGPT/Codex

A integração usa o Codex CLI/app-server instalado localmente e a autenticação
oficial da conta. Planos, limites, disponibilidade e tratamento de dados são
responsabilidade da OpenAI e da pessoa usuária.

### SkynetChat

A integração é um adaptador de compatibilidade para a interface web e seus
endpoints observados. Não é um SDK público oficial e pode deixar de funcionar
quando o serviço mudar. O trabalho inicial foi realizado com autorização do
responsável pelo serviço; contribuidores ainda devem respeitar escopo, termos e
autorizações aplicáveis.

O código de acesso e os cookies ficam no processo Electron isolado. Mensagens,
contexto profissional confirmado e histórico recente só são enviados após
consentimento explícito.

## Plataformas de emprego

LinkedIn, Gupy, InfoJobs, PandaPé, Catho, Vagas.com, Sólides e outras marcas
pertencem aos seus titulares. Cada integração possui capacidades e limitações
próprias. A pessoa é responsável por usar sua conta de acordo com os termos da
plataforma.

O Fluxo não contorna CAPTCHA, MFA, fiscalização ou antiautomação. Uma plataforma
que bloqueie o fluxo deve permanecer manual ou ser desabilitada.

## Componentes redistribuídos

A fonte Inter é distribuída sob SIL Open Font License 1.1. A licença está em
`apps/desktop/app/public/fonts/LICENSE-Inter.txt`.

Dependências JavaScript mantêm suas próprias licenças, registradas no lockfile e
nos avisos produzidos pelo Electron.
