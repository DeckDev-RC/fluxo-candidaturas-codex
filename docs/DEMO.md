# Demonstração segura

O modo demo apresenta a interface com fixtures sintéticas. Ele não abre
plataformas, não usa contas e não executa ações externas.

## Executar

```powershell
npm ci
npm run start:web
```

Abra:

```text
http://127.0.0.1:4173/?demo=1
```

## Roteiro de cinco minutos

1. Em **Conversa**, mostre objetivo, currículo, plataformas e percurso.
2. Em **Oportunidades**, explique fila, aderência e requisitos ainda não medidos.
3. Em **Candidaturas**, mostre status e próxima ação.
4. Em **Configurações**, apresente seleção Skynet/Codex e transparência de dados.
5. Em **Decisões**, explique que nenhuma ação sensível é aprovada pelo modelo.

## Evidência visual

- `docs/assets/fluxo-conversa.png`
- `docs/assets/fluxo-oportunidades.png`
- `docs/assets/fluxo-configuracoes.png`

Ao atualizar a UI, regenere as imagens somente com `?demo=1` e revise cada pixel
antes do commit. Não use capturas de contas ou candidaturas reais.
