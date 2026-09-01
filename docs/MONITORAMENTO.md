# Monitoramento recorrente

O relatório local e a verificação real são etapas diferentes:

1. `scripts/monitorar-pendencias.ps1` lista prazos e ações já registradas.
2. O agente abre as plataformas com Playwright, consulta mensagens e estados e usa `registrar-evento.ps1`.
3. `scripts/gerar-painel.ps1` consolida o resultado.

Para recorrência, peça no chat uma tarefa agendada com frequência e horário explícitos, por exemplo:

```text
Agende para segundas, quartas e sextas às 09:00: abrir este projeto, ler AGENTS.md, listar pendências, verificar no navegador as plataformas habilitadas, registrar mudanças e me notificar. Pare em login, MFA ou CAPTCHA.
```

Se o ambiente não oferecer execução agendada com navegador, crie apenas um lembrete. Nunca afirme que estados foram monitorados quando somente o arquivo local foi lido.
