# Fluxo de candidaturas assistido por Codex

Versão distribuível: **1.0.0**.

## Linha de produto P0: App Harness

O App Harness é a base da linha de produto P0 do Fluxo: uma interface **local-first**, **single-user** e operada em conjunto com o agente do Codex. Ele organiza onboarding, preflight, campanha, fila, candidaturas, questionários, acompanhamento e retomada sem transformar o pacote em SaaS remoto ou em um bot externo executado sem conversa.

O servidor do Harness escuta somente em `127.0.0.1`. Os arquivos JSON existentes continuam sendo a fonte operacional nesta fase, e ações externas permanecem sujeitas à confirmação e aos limites definidos pelo Fluxo.

## Início oficial do App Harness

Na pasta `app/`, execute:

```powershell
npm start
```

Abra `http://127.0.0.1:4173`. Para validar a instalação antes de operar:

```powershell
npm test
```

O comando oficial de preparação de uma instalação continua sendo `.\scripts\primeiro-uso.ps1`, executado a partir da raiz do repositório.

## Organização do repositório

- **Código do produto:** `app/src/`, `app/public/`, `scripts/`, `templates/` e `config/`.
- **Dados privados e operacionais locais:** `.env`, `perfil/`, `curriculo/`, `campanha/`, `fila/`, `estado/`, `candidaturas/`, `evidencias/` e `mensagens/`. Não entram em compartilhamentos.
- **Artefatos gerados:** relatórios como `candidaturas/controle-candidaturas.md` e `candidaturas/painel.md`, além do pacote sanitizado produzido em `dist/`. Devem ser regenerados pelos comandos oficiais.
- **Fixtures e testes:** `app/test/` e seus dados de teste locais; não usam contas reais nem enviam candidaturas reais.

O pacote é reutilizável para o próprio agente do Codex trabalhar com o usuário pelo chat, usar a habilidade Playwright no navegador e conduzir onboarding, busca, fila, formulários, candidaturas, questionários e acompanhamento.

## Capacidades

- onboarding dos dados recorrentes de formulários, preferências, filtros e fatos profissionais;
- currículo local como fonte de verdade, extração de DOCX/PDF e escolha entre variantes;
- URLs, logins e senhas somente no `.env` privado;
- metas totais, diárias, semanais e independentes por plataforma;
- busca e priorização por aderência e requisitos eliminatórios;
- fila deduplicada e checkpoint para continuar de onde parou;
- candidatura via habilidade `$playwright`, com sessão persistente;
- tratamento de links de questionários e testes, cronômetro e editor de código;
- controle estruturado, painel de progresso, prazos, resultados e evidências;
- importação de controles Markdown antigos;
- rascunhos de mensagens para recrutadores;
- ZIP compartilhável sem credenciais ou dados do candidato.

## Requisitos

- Codex no aplicativo do ChatGPT, IDE ou CLI, aberto na pasta `Fluxo/`;
- Node.js/npm com `npx`;
- habilidade `$playwright` instalada e habilitada;
- navegador compatível e internet;
- opcionalmente, `$playwright-interactive` para iteração visual persistente;
- opcionalmente, `pdftotext`/Poppler para extrair PDF; DOCX é extraído pelo PowerShell.

## Início rápido

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\primeiro-uso.ps1
```

Esse comando orienta a preparação, executa o onboarding e roda automaticamente o preflight. Pelo chat, basta abrir a pasta e pedir: `Faça minha primeira configuração`; o `AGENTS.md` determina a mesma sequência guiada.

Depois, abra esta pasta como projeto e diga:

```text
Leia o AGENTS.md, valide o ambiente, retome o checkpoint se existir e use a habilidade Playwright. Trabalhe comigo pelo chat, atualize o controle após cada confirmação e continue até as metas configuradas ou um bloqueio real.
```

## Operação

```powershell
# Criar ou substituir metas
.\scripts\inicializar-campanha.ps1

# Importar histórico já existente
.\scripts\importar-controles-legados.ps1 -Directory ..

# Inserir e selecionar vagas
.\scripts\adicionar-vaga.ps1 -Platform GUPY -Company Empresa -Role 'Pessoa Desenvolvedora' -IdentifierOrUrl 123 -Priority A -FitScore 85
.\scripts\proxima-acao.ps1 -Claim
.\scripts\retomar-fluxo.ps1

# Registrar uma confirmação e eventos posteriores
.\scripts\nova-candidatura.ps1 -Platform GUPY -Company Empresa -Role 'Pessoa Desenvolvedora' -IdentifierOrUrl 123 -Status enviada
.\scripts\registrar-evento.ps1 -Reference 123 -Type status -Status triagem -NextAction 'Aguardar retorno'
.\scripts\registrar-resultado-teste.ps1 -Reference 123 -TestName 'Teste técnico' -Score 5 -Total 5

# Painel e prazos
.\scripts\gerar-painel.ps1
.\scripts\monitorar-pendencias.ps1

# Currículo e mensagens
.\scripts\extrair-curriculo.ps1 -Path .\curriculo\curriculo.docx
.\scripts\selecionar-curriculo.ps1 -JobDescription 'descrição integral da vaga'
.\scripts\gerar-mensagem-recrutador.ps1 -Company Empresa -Role Vaga -Highlights Python,React

# Distribuição segura
.\scripts\exportar-compartilhavel.ps1
.\scripts\testar-distribuicao.ps1
```

## Estrutura

```text
Fluxo/
├── AGENTS.md
├── README.md
├── .env.example
├── app/                # App Harness local: código, UI e testes/fixtures
├── config/plataformas.json
├── perfil/             # perfil privado criado no onboarding
├── curriculo/          # PDF, DOCX e textos privados
├── campanha/           # metas privadas
├── fila/               # vagas deduplicadas
├── estado/             # checkpoint de retomada
├── candidaturas/       # JSON, controle Markdown e painel
├── evidencias/         # confirmações e resultados
├── mensagens/          # rascunhos privados
├── docs/               # manuais operacionais
├── templates/          # modelos compartilháveis
└── scripts/            # comandos locais
```

## Documentação

- `app/README.md`: execução e endpoints do App Harness local.
- `docs/OPERACAO.md`: sequência de ponta a ponta.
- `docs/PRIMEIRO-USO.md`: onboarding guiado e preflight.
- `docs/PLAYWRIGHT.md`: uso do navegador pelo agente.
- `docs/PLATAFORMAS.md`: Gupy, InfoJobs, PandaPé, LinkedIn, Catho, Vagas.com e Sólides.
- `docs/QUESTIONARIOS-E-TESTES.md`: links, cronômetro, autoria e editor de código.
- `docs/METAS-FILA-RETOMADA.md`: campanha contínua, fila, erros e checkpoint.
- `docs/CURRICULOS.md`: extração e variantes.
- `docs/DADOS-E-COMANDOS.md`: arquivos estruturados e scripts.
- `docs/MENSAGENS-E-ACOMPANHAMENTO.md`: contato com recrutadores.
- `docs/MONITORAMENTO.md`: revisão recorrente e notificações.
- `docs/DISTRIBUICAO.md`: geração, teste e verificação do pacote final.
- `docs/SEGURANCA.md`: credenciais, privacidade e limites.

## Compartilhamento

Não compartilhe `.env`, `perfil/candidato.md`, currículo real, fila, campanha, checkpoint, evidências, mensagens nem histórico. `scripts/exportar-compartilhavel.ps1` monta em `dist/` um ZIP sanitizado com apenas instruções, modelos, configuração pública e scripts.
