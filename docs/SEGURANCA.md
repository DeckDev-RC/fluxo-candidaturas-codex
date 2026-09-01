# Segurança e privacidade

## Nunca compartilhar

- `.env` real
- senhas, tokens, cookies e códigos MFA
- currículo sem revisar dados pessoais
- `perfil/candidato.md` preenchido
- controles com e-mail, telefone ou links privados
- URLs de convite contendo identificadores pessoais
- `campanha/config.json`, fila, checkpoint, evidências e mensagens reais

## Credenciais

O formato `.env` existe por praticidade local, mas senhas em texto puro têm risco. Para uso prolongado, prefira um gerenciador de senhas ou o cofre de credenciais do sistema. Se usar `.env`:

- mantenha o computador protegido;
- limite acesso à pasta;
- não sincronize com repositório público;
- use senhas exclusivas;
- troque imediatamente uma senha exposta.

Os scripts usam `Read-FluxoEnvValue` para ler somente a chave necessária. Eles não importam o `.env` como código, não usam `Invoke-Expression` e não imprimem segredos.

Ao refazer onboarding ou campanha, os arquivos anteriores são copiados para diretórios locais `backups/`, que permanecem ignorados pelo Git e fora do ZIP distribuível. Esses backups continuam sendo privados.

## Automação

- Respeite os termos das plataformas.
- Não contorne CAPTCHA ou MFA.
- Não automatize avaliações que exigem autoria do candidato.
- Revise candidaturas em massa para evitar dados incorretos e baixa qualidade.
- Mantenha `REQUIRE_FINAL_CONFIRMATION=true` no primeiro uso.
- Não salve capturas que exponham senhas, cookies, tokens, documentos ou respostas sensíveis.
