# Operação do fluxo

## 1. Preparar

- Na primeira utilização, executar `scripts/primeiro-uso.ps1` ou pedir o onboarding pelo chat.
- Conferir o perfil gerado.
- Adicionar currículo em PDF ou DOCX.
- Preencher o `.env` local.
- Executar a validação.
- Concluir o preflight sem pendências críticas antes de iniciar a campanha.
- Inicializar a campanha e importar controles existentes, quando houver.

## 2. Definir a campanha

Antes de buscar vagas, confirme:

- meta total;
- meta diária e semanal;
- período da campanha;
- cargos e senioridades;
- tecnologias prioritárias;
- modalidade e local;
- salário mínimo;
- plataformas habilitadas;
- critérios eliminatórios.

## 3. Priorizar vagas

Classificação sugerida:

- **A**: alta aderência, sem eliminatório e boa prioridade.
- **B**: aderência parcial, lacunas treináveis.
- **C**: baixa aderência ou esforço alto.
- **Não aplicar**: requisito eliminatório, local, contrato ou salário incompatível.

## 4. Preencher

1. Abrir a vaga e salvar sua descrição essencial.
2. Verificar se o identificador já existe no controle.
3. Comparar requisitos com perfil e currículo.
4. Preencher dados objetivos.
5. Redigir respostas abertas personalizadas.
6. Conferir anexos e dados sensíveis.
7. Exibir resumo pré-envio.
8. Obter confirmação quando configurado.
9. Enviar e capturar a confirmação.
10. Registrar status e próxima ação.

Depois de cada etapa relevante, salve o checkpoint. Depois de cada confirmação, atualize o JSON estruturado e regenere o painel. Use a fila para continuar até as metas por plataforma, sem reaplicar IDs conhecidos.

## 5. Acompanhar

Faça uma revisão recorrente por plataforma:

- novas mensagens;
- testes liberados;
- entrevistas agendadas;
- prazos;
- rejeições;
- propostas;
- vagas sem retorno.

Registre a data da última verificação, mas não altere `sem retorno` para `rejeitada` sem evidência.

Use `scripts/monitorar-pendencias.ps1` para a lista local e o navegador para confirmar estados reais. Consulte `MONITORAMENTO.md` para recorrência.
