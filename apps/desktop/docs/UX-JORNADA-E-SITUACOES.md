# Fluxo — jornada, situações de uso e destino dos controles

Entregável de U0 do [checklist de repaginação](../../docs/CHECKLIST-REPAGINACAO-UI-UX.md). Descreve o uso real, a jornada com os desvios e onde cada controle antigo passou a morar. Não substitui a validação com pessoas (U10), que continua pendente.

**Versão da interface:** 1.2.0, árvore `.worktrees/fluxo-desktop`.

## 1. Três situações de uso

### A. Candidata nova, nunca usou o Fluxo

| Aspecto | Descrição |
|---|---|
| Necessidade | Começar a procurar sem preencher cadastro longo nem entender o produto antes |
| Contexto | Primeira abertura; tem um currículo em PDF em alguma pasta do computador |
| Próxima ação | Escrever o objetivo com as próprias palavras e escolher o arquivo do currículo |
| Sucesso | Em uma tela, o objetivo está registrado, o currículo foi transferido, verificado e lido, e o Fluxo mostra o que entendeu |
| Onde acontece | Tela **Agora** no estado `primeiro-uso`, que já traz o painel de objetivo e currículo |

### B. Candidata acompanhando uma campanha em andamento

| Aspecto | Descrição |
|---|---|
| Necessidade | Saber o que aconteceu desde ontem e o que exige atenção agora |
| Contexto | Reabre o app depois de horas ou dias; há candidaturas enviadas e talvez retorno de empresa |
| Próxima ação | Ler o estado no cabeçalho, resolver as decisões pendentes e conferir prazos |
| Sucesso | Entende em segundos o objetivo ativo, o que o Fluxo está fazendo, quantas decisões esperam por ela e qual é o próximo passo de cada processo |
| Onde acontece | Cabeçalho persistente, indicador de decisões, painéis “O que já aconteceu” e “Compromissos e prazos” |

### C. Candidata resolvendo um bloqueio

| Aspecto | Descrição |
|---|---|
| Necessidade | Entender o que travou, se algo foi enviado e o que fazer sem duplicar candidatura |
| Contexto | A plataforma pediu CAPTCHA, a sessão expirou, o envio ficou incerto ou a IA caiu |
| Próxima ação | Abrir a decisão correspondente e executar a ação segura oferecida |
| Sucesso | Sabe o que foi verificado, o que não foi, e resolve sem risco de enviar duas vezes |
| Onde acontece | Estados `envio-incerto`, `acesso-indisponivel` e `pausada` na tela Agora; caixa de **Decisões**; ação “Conferir na plataforma” |

## 2. Jornada completa, com os desvios

```text
objetivo + currículo
   ├── arquivo corrompido ou PDF sem texto → etapa 3 marcada como falha, original preservado
   └── leitura ok
        ↓
o que entendi sobre você
   ├── lacuna → pergunta na caixa de decisões → resposta vira fato confirmado
   └── divergência entre duas versões → escolha explícita da pessoa
        ↓
busca nas plataformas habilitadas
   ├── plataforma fora do ar → falha temporária, com nova tentativa
   ├── busca indisponível por escopo → informado como indisponível, sem repetir
   └── nenhuma vaga adequada → critérios aplicados + opções (ajustar, agendar, encerrar)
        ↓
comparação de aderência
   └── requisito eliminatório → não aplica e explica
        ↓
preparação da candidatura
   ├── CAPTCHA/MFA → pausa e devolve a tarefa para a pessoa
   └── página não suportada → marcada como tal, sem fingir ausência de novidade
        ↓
revisão pré-envio (decisão humana obrigatória)
   ├── rejeitar → nada é enviado, vaga permanece na lista
   ├── revisão alterada → aprovação perde validade, exige nova revisão
   └── aprovar → a tarefa autorizada segue sozinha até a confirmação
        ↓
confirmação da plataforma
   ├── confirmada → candidatura registrada com evidência
   ├── negada → não conta como enviada
   └── incerta → reconciliação; nunca reenvio automático
        ↓
acompanhamento
   ├── novidade observada → histórico da candidatura + notificação
   ├── sem adaptador → pedido de conferência manual
   └── app fechado → agenda retoma ao reabrir; nada é prometido com o computador desligado
```

Nenhuma etapa exige que a pessoa entenda agente, arquivo interno, identificador técnico ou protocolo.

## 3. Trabalho automático versus decisão humana

| Faz sozinho | Sempre pede a pessoa |
|---|---|
| Ler currículo, extrair fatos, buscar, comparar, deduplicar, preencher campos confirmados, capturar evidência, consultar novidades | Enviar candidatura, aceitar declaração legal ou consentimento opcional, informar pretensão fora da faixa, desistir de vaga, iniciar teste cronometrado, enviar mensagem a recrutador, responder dado sensível |

A interface não tem botão para despachar especialista, escolher agente ou administrar execução. O trabalho dos especialistas fica disponível em “Como o Fluxo chegou aqui”, como leitura, não como painel de controle.

## 4. Destino de cada controle da interface anterior

| Controle anterior | Destino atual | Situação |
|---|---|---|
| Painel “Autopilot” com plano fixo | Tela **Agora** com 11 estados derivados do estado persistido | incorporado |
| “Fila” com formulário de cadastro de vaga | **Oportunidades**, com lista comparável e filtros de visualização | incorporado |
| Botões extrair / calcular aderência / selecionar currículo | Etapas internas; revisão em **Meu perfil** e no detalhe da vaga | incorporado à automação |
| Campos de ID de execução e de vaga | Seleção contextual; identificador só no detalhe de suporte | removido do caminho principal |
| Botão “Conectar streaming” | Conexão automática com reconexão visível | incorporado |
| “Executar preflight” e resumo técnico | **Configurações → Este computador está pronto?** e janela de preparação | incorporado |
| Painel de aprovações solto | Caixa de **Decisões** + revisão dedicada no diálogo | incorporado |
| Formulário de registrar acompanhamento | Histórico da candidatura + “Adicionar informação que recebi” | incorporado |
| Modelos, effort, consumo e provedor de IA | **Configurações → Automação de IA** | incorporado |
| Exportar pacote / migrar / reconciliar | **Configurações → Dados e recuperação** | incorporado |
| Tela “Operações” com métricas cruas | Blocos de resultado em Agora e detalhes de suporte em Ajuda | reduzido de propósito |
| Modo de demonstração `?fixture=demo` | `?demo=1`, com aviso permanente de dados fictícios | incorporado |

Nada foi removido sem destino. Os módulos `persistence.js`, `preflight-summary.js`, `oauth-window.js`, `autopilot-decisions.js` e `styles.css` saíram porque a função deles vive agora nos módulos por área.

## 5. Antes e depois nos fluxos equivalentes (U9-07)

| Tarefa | Antes | Agora |
|---|---|---|
| Importar currículo | Escolher arquivo dentro da pasta do projeto; o nome sozinho já parecia importação | Escolher qualquer pasta; quatro etapas visíveis: escolhido, transferido e verificado, lido, revisado |
| Responder uma lacuna | Nenhum caminho na interface; a jornada ficava parada em silêncio | Pausa publicada no cabeçalho e na caixa de decisões; responder retoma a tarefa correta |
| Aprovar um envio | Preparar, solicitar aprovação, decidir no painel e clicar “Confirmar envio” | Preparar e revisar em um diálogo com empresa, cargo, currículo e cada campo; aprovar executa até a confirmação |
| Ver o que aconteceu | Timeline parecida com log de eventos técnicos | Atualizações de tarefa com empresa, vaga e consequência; log técnico em detalhe de suporte |
| Descobrir o próximo passo | Precisava abrir cada candidatura | Painel de compromissos e prazos, com origem (observado ou registrado por você) |
| IA indisponível | A leitura local travava por até um minuto | A leitura local não depende da IA; o painel de IA reporta indisponibilidade com prazo limitado |

## 6. O que ainda depende de pessoas

| Item | Por que não pode ser concluído sem participantes |
|---|---|
| U0-05 | Linha de base de usabilidade exige observar alguém executando as tarefas |
| U1-01, U1-02 | Comparar duas explorações visuais e escolher uma é decisão de pessoa, não de código |
| U2-01 | O aceite é “participante encontra sem explicação”; só um teste com pessoa comprova |
| U8-02 (leitor de tela) | Navegação por teclado está coberta por teste; leitor de tela exige verificação assistiva real |
| U10-01 a U10-03, U10-06 | Teste com pelo menos cinco pessoas e aprovação da candidata visual |
