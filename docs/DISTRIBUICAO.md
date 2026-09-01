# Distribuição da versão 1.0.0

## Artefatos oficiais

Distribua somente:

- o ZIP criado por `scripts/exportar-compartilhavel.ps1`;
- o arquivo `.sha256` correspondente, para verificação de integridade.

Não compacte manualmente a pasta de trabalho, pois ela pode conter `.env`, perfil, currículo, fila, histórico, evidências e checkpoints privados.

## Checklist do responsável pela distribuição

1. Confira que `VERSION` contém a versão esperada.
2. Execute `scripts/autoteste.ps1`.
3. Execute `scripts/exportar-compartilhavel.ps1`.
4. Execute `scripts/testar-distribuicao.ps1` apontando para o ZIP criado.
5. Confirme que o teste informa zero arquivos privados e checksum válido.
6. Compartilhe o ZIP e seu `.sha256`; não compartilhe a pasta fonte preenchida.

## Verificação pelo destinatário

```powershell
Get-FileHash .\fluxo-candidaturas-v1.0.0-AAAAMMDD-HHMMSS.zip -Algorithm SHA256
Get-Content .\fluxo-candidaturas-v1.0.0-AAAAMMDD-HHMMSS.zip.sha256
```

Os valores devem ser idênticos. Depois de extrair, o destinatário abre `Fluxo/` no Codex e pede: `Faça minha primeira configuração`.

## Licenciamento

Este pacote não presume uma licença jurídica. Antes de publicá-lo em repositório público, o responsável deve escolher e adicionar a licença adequada. Isso não impede compartilhamento privado autorizado.
