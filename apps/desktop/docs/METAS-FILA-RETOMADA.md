# Metas, fila e retomada

## Meta por plataforma

`campanha/config.json` separa meta total, diária, semanal e por plataforma. Uma candidatura conta para a meta somente depois de confirmação visual. Rascunhos, duplicatas e tentativas com erro não contam.

## Fila

Cada vaga recebe prioridade `A`, `B` ou `C`, pontuação de aderência, prazo e identificador deduplicado. `proxima-acao.ps1 -Claim` escolhe a melhor vaga elegível e salva a retomada.

```powershell
.\scripts\adicionar-vaga.ps1 -Platform GUPY -Company Empresa -Role 'Pessoa Desenvolvedora' -IdentifierOrUrl 123 -Priority A -FitScore 82
.\scripts\proxima-acao.ps1 -Claim
```

## Loop do agente

1. Gerar painel e verificar checkpoint.
2. Tratar testes e prazos urgentes.
3. Buscar vagas compatíveis e adicioná-las à fila.
4. Selecionar a próxima vaga.
5. Navegar, revisar, enviar quando autorizado, capturar confirmação e registrar.
6. Repetir até meta, limite por execução ou bloqueio real.

## Erros e retomada

- Depois de cada mudança de página, atualize o checkpoint.
- Em falha de referência, tire novo snapshot e tente novamente.
- Em falha repetida, registre a mensagem e passe para outra vaga se isso não causar perda de dados.
- Use `scripts/registrar-falha-fila.ps1`; o item volta à fila ou muda para `bloqueada` ao atingir o limite.
- Pare após `MAX_CONSECUTIVE_FAILURES` no mesmo bloqueio.
- Ao retomar, leia `estado/checkpoint.json`, confira visualmente a página e continue do último estado confirmado.

`scripts/retomar-fluxo.ps1` resume campanha, fila e checkpoint sem abrir credenciais.
