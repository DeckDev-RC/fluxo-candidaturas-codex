# Política inicial de autonomia supervisionada

**Confirmação final:** ligada (`REQUIRE_FINAL_CONFIRMATION=true`).  
**Envio automatizado:** não dispensa decisão sensível. `ALLOW_AUTOMATED_SUBMISSION` nunca aprova pelo usuário.

## Ações externas

| Ação | Regra | Quem decide | Pausa |
|---|---|---|---|
| Busca e leitura de vaga pública | Permitida nas plataformas habilitadas da campanha | Sistema, dentro do orçamento | Página não suportada, CAPTCHA, sessão expirada |
| Preenchimento com fato confirmado | Permitido | Sistema usa só memória confirmada | Lacuna, conflito ou campo sensível |
| Campo pessoal, salarial, legal ou de autoria | Exige decisão humana | Candidato | Sempre |
| Envio da candidatura | Exige revisão vinculada + aprovação humana válida | Candidato | Sempre, mesmo com autorização de campanha |
| Mensagem a recrutador | Somente rascunho nesta versão; envio tem autorização própria | Candidato | Sem confirmação observada não envia |
| Teste cronometrado ou fiscalizado | Não inicia sozinho | Candidato | Mostra duração/regras e espera |
| MFA, CAPTCHA, biometria | Sem contorno | Candidato | Pausa a capacidade e retoma a mesma tarefa |
| Aprovação de revisão | Proibida para agente, runtime e ferramenta | Somente usuário autenticado | Tentativa do agente é recusada no gateway |

Autorizações de campanha (metas, plataformas, orçamento) não substituem portões sensíveis.
