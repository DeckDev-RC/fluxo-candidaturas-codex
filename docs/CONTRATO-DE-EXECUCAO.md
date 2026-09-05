# Contrato de execução do App Harness

Este documento congela o contrato operacional do App Harness local no P0. O produto é
local-first, single-user e assistido pelo Codex. Ele não é um bot remoto, um SaaS
multiusuário ou um serviço que envia candidaturas sem confirmação.

## Pré-requisitos

Na máquina que abrirá o projeto, valide:

- Node.js **>= 24** e npm;
- PowerShell e `npx` no `PATH`;
- Codex CLI, quando o modo de agente for usado;
- Playwright/CLI do Playwright e um navegador compatível, quando uma execução de
  navegador for autorizada.

O preflight pode registrar a indisponibilidade de PowerShell, Codex, Playwright ou
internet. Isso é um bloqueio explícito para a capacidade correspondente, não uma
permissão para contorná-lo com credenciais, shell remoto ou automação escondida.

## Inicialização e endereço

Na raiz do pacote:

```powershell
Set-Location .\app
npm test
npm start
```

O servidor escuta exclusivamente em `127.0.0.1` e usa a porta padrão **4173**.
Abra `http://127.0.0.1:4173` no navegador local. A porta pode ser alterada com
`PORT`; o root operacional pode ser alterado com `FLUXO_ROOT`:

```powershell
$env:FLUXO_ROOT = 'C:\caminho\para\Fluxo'
$env:PORT = '4174'
npm start
```

`FLUXO_ROOT` deve apontar para uma instalação local do Fluxo. Não exponha o servidor
em `0.0.0.0` nem encaminhe sua porta para a internet. O endpoint `GET /health`
confirma que o servidor está vivo, sem revelar estado privado.

## Modos de execução

O modo descreve como o agente conversa com o ambiente; não altera os limites de
segurança do Fluxo:

- **`chatgpt`**: operação assistida pelo agente no ChatGPT/Codex. O usuário confirma
  ações externas e o agente usa Playwright somente na sessão autorizada.
- **`api-key`**: integração local autenticada por uma chave fornecida pelo usuário,
  quando essa integração estiver disponível. A chave fica somente no ambiente local;
  nunca deve aparecer em logs, eventos, payloads, exportações ou na UI.
- **fixture**: dados sintéticos para testes e demonstrações. Uma fixture **não
  representa candidatura real**, não deve ser misturada com o root do usuário e não
  acessa contas ou plataformas.
- **offline**: operação sem internet, Codex ou Playwright disponíveis. Permite ler e
  validar estado local e preparar/revisar dados, mas não confirma estado de uma
  plataforma nem envia candidatura.

Se Codex ou Playwright estiver indisponível, o fluxo deve parar na capacidade que
depende dele e mostrar a pendência. Se a internet estiver indisponível, buscas,
login, leitura de status externo e qualquer envio ficam indisponíveis. O modo fixture
ou offline não transforma uma simulação em operação real.

## Dados, segredos e arquivos gerados

`.env` é privado e contém controles e, se configurados, credenciais. O arquivo
`.env.example` é apenas modelo. Segredos nunca devem ser commitados, impressos ou
copiados para `estado/`.

O diretório `estado/` contém artefatos locais gerados, como checkpoint, preflight,
lock, banco do harness, backups e evidências transitórias. Esses arquivos não entram
no Git e não devem ser compartilhados. O estado persistido é a fonte para retomada;
antes de uma ação externa, revise o estado e obtenha a confirmação exigida.

O servidor e os testes não acessam contas reais nem enviam candidaturas reais. Toda
ação de navegador, exportação ou mutação permanece sujeita às políticas do Fluxo,
à sessão local e à confirmação humana final.
