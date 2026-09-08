# Dados e comandos operacionais

Arquivos JSON são a fonte estruturada; arquivos Markdown são relatórios regeneráveis.

- `campanha/config.json`: metas e limites.
- `fila/vagas.json`: vagas encontradas, prioridade e tentativas.
- `candidaturas/candidaturas.json`: registros, histórico, testes e evidências.
- `estado/checkpoint.json`: ponto de retomada.
- `candidaturas/controle-candidaturas.md`: tabela detalhada.
- `candidaturas/painel.md`: progresso por plataforma e pendências.

Comandos principais:

```powershell
.\scripts\inicializar-campanha.ps1
.\scripts\adicionar-vaga.ps1 -Platform GUPY -Company Empresa -Role Vaga -IdentifierOrUrl URL
.\scripts\proxima-acao.ps1 -Claim
.\scripts\registrar-falha-fila.ps1 -Reference ID -ErrorMessage 'descrição objetiva'
.\scripts\retomar-fluxo.ps1
.\scripts\nova-candidatura.ps1 -Platform GUPY -Company Empresa -Role Vaga -IdentifierOrUrl URL -Status enviada
.\scripts\registrar-evento.ps1 -Reference ID -Type status -Status triagem -NextAction 'Aguardar retorno'
.\scripts\registrar-resultado-teste.ps1 -Reference ID -TestName Técnico -Score 5 -Total 5
.\scripts\gerar-painel.ps1
.\scripts\monitorar-pendencias.ps1
.\scripts\importar-controles-legados.ps1
```
