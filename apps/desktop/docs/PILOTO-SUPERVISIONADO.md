# Piloto supervisionado — preparação (F9)

Este documento **não autoriza** envio real, mensagem real ou login em conta de produção. A autorização específica do candidato precisa ser obtida antes de qualquer ação irreversível.

## Pré-requisitos registrados

| Campo | Valor |
|---|---|
| Candidato | A preencher pelo responsável do piloto |
| Conta própria | A preencher |
| Currículo revisado | Variante com hash persistido no app |
| Plataformas | Somente as marcadas assistida/manual na matriz |
| Limites | Os valores da revisão inicial em `LIMITES-CAMPANHA.md` |
| Autorização de envio | Ausente até decisão explícita |

## O que o app já faz no piloto

Importar currículo, informar objetivo, iniciar Autopilot, responder lacunas, pausar, retomar e acompanhar pela UI, sem terminal ou JSON manual.

## O que permanece pendente de evidência R

Login, busca, preenchimento, envio e acompanhamento observados em conta real. Se ainda não houver retorno externo, registrar o limite e não inventar evento.

## O que depende de você antes de liberar

Os itens abaixo não podem ser concluídos por análise de código nem em site controlado. Cada um exige uma ação do responsável do piloto.

| Item | O que é preciso | Por que não foi feito |
|---|---|---|
| **F2-02** — contrato do App Server | Instalar o Codex CLI e concluir o login OAuth do ChatGPT na conta de teste autorizada; depois abrir uma jornada com o runtime ativo | O Codex CLI não está instalado nesta máquina e o login é uma etapa pessoal |
| **F7-06** — Windows limpo | Instalar `Fluxo-1.2.0-Windows-x64.exe` em uma máquina ou VM sem ferramentas de desenvolvedor e concluir o primeiro uso pelo app | Exige um ambiente limpo, fora desta estação de trabalho |
| **F7-07** — atualização e desinstalação | Instalar a versão anterior, atualizar para a 1.2.0 com dados existentes, conferir preservação e desinstalar | Depende do mesmo ambiente limpo |
| **F9-01 a F9-06** — piloto real | Autorização explícita e por escrito do candidato, conta própria, currículo revisado e uma oportunidade legítima | O checklist não autoriza envio real; a decisão é da pessoa candidata |

Enquanto esses itens estiverem abertos, o produto deve ser descrito como **candidata com jornada controlada certificada**, nunca como autonomia real em plataforma.

## Como conduzir o piloto quando houver autorização

1. Registrar a autorização, a conta, as plataformas e os limites nas tabelas acima.
2. Executar o preflight pelo app e resolver pendências antes de qualquer navegação.
3. Manter `REQUIRE_FINAL_CONFIRMATION=true` durante todo o piloto.
4. Conduzir uma candidatura por plataforma anunciada, decidindo cada envio na revisão.
5. Registrar resultado, evidência e limites observados; capacidade sem confirmação da plataforma continua não certificada.
6. Só preencher o termo da seção 7 do checklist depois de F9-01 a F9-05.
