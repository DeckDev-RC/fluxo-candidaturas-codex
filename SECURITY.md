# Política de segurança

## Versões suportadas

Correções de segurança são aplicadas à branch `main` e à release mais recente.
Versões anteriores podem receber correções apenas quando o impacto justificar.

## Como reportar

Não abra uma issue pública para vulnerabilidades, vazamento de dados ou falhas de
autorização. Use o
[reporte privado de vulnerabilidade do GitHub](https://github.com/DeckDev-RC/fluxo-candidaturas-codex/security/advisories/new).

Inclua apenas:

- versão e sistema operacional;
- impacto observado;
- passos mínimos para reprodução com dados sintéticos;
- sugestão de correção, se houver.

Nunca envie senhas, cookies, tokens, códigos de acesso, currículos reais,
histórico de navegação ou dados de candidaturas. A DeckDev-RC pretende confirmar
o recebimento em até cinco dias úteis e combinar a divulgação após a correção.

## Escopo

São relevantes, entre outros:

- contorno de aprovação humana;
- acesso a arquivos fora da pasta de dados;
- exposição das sessões Codex, SkynetChat ou plataformas;
- execução de comandos pelo conteúdo de uma página;
- vazamento em logs, exportações, evidências ou releases;
- acesso remoto ao servidor local ou ao CDP.

Falhas exclusivas de serviços de terceiros devem ser reportadas também ao
respectivo fornecedor. Não teste contas, vagas ou sistemas sem autorização.

## Modelo de segurança

O Fluxo é local-first e escuta apenas em loopback. Dados operacionais ficam na
pasta escolhida pela pessoa. Mensagens e contexto necessários são enviados ao
provedor de IA selecionado somente após consentimento; credenciais e cookies não
são copiados para a conversa. Ações externas sensíveis exigem uma aprovação
autenticada e vinculada ao conteúdo exato.
