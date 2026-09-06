# Checklist — melhorias de experiência (levantamento de 06/09/2026)

Sete frentes, na ordem de impacto. Cada item marcado tem teste ou verificação real.

## 1. Aderência real

- [ ] `fluxo_read_job(itemId)`: abre a página da vaga na aba da plataforma, extrai
      descrição, requisitos (listas sob "Requisitos/Qualificações/Requirements"),
      modalidade e local; grava na vaga; recalcula e grava a aderência.
- [ ] Interface: sem requisitos lidos, o selo diz "aderência não medida" em vez de 50%.
- [ ] Instrução da IA: antes de preparar, ler as melhores candidatas (até 3) para medir.
- [ ] Narração e teste no fluxo real das ferramentas.

## 2. Fila organizada por busca

- [ ] Cada vaga carrega a busca que a trouxe (`searchQuery`, `searchAt`).
- [ ] Oportunidades agrupadas por busca, a mais recente primeiro, com contagem.
- [ ] Acompanhamento mostra de qual busca são as vagas da fila.
- [ ] Cartão de seleção para descartar na conversa (`AÇÃO: selecionar-descarte=ids`):
      caixas de marcar, "Descartar selecionadas", volta para a IA como evento de sistema.

## 3. Menos espera às cegas

- [ ] Login detectado sozinho: enquanto espera login/verificação/cookies, o serviço
      observa a aba e, ao resolver, avisa a IA para continuar (sem "Já entrei").
- [ ] Notificações do sistema quando a janela não está em foco (login, aprovação,
      erro) e destaque na barra de tarefas.

## 4. Primeiro uso mais fluido

- [ ] Cartão de confirmação dos dados do currículo (`AÇÃO: confirmar=campo:valor|…`):
      campos editáveis, "Está certo", grava tudo confirmado de uma vez.
- [ ] Respostas rápidas (`AÇÃO: opcoes=a|b|c`): botões que enviam o texto como fala.
- [ ] Cartão de primeiro uso recolhe para uma linha depois de "Começar".

## 5. Confiança durante o trabalho

- [ ] Passo em andamento mostra indicador e tempo decorrido até concluir.
- [ ] Falha de ferramenta traduzida para o que a pessoa pode fazer; termos técnicos
      não vazam para a conversa.

## 6. Aba com controles

- [ ] Mini cabeçalho da aba: voltar, recarregar, abrir em janela externa.
- [ ] "Ampliar" alterna a área para a altura da coluna.

## 7. Detalhes

- [ ] Dicionário único de rótulos de status em pt-BR.
- [ ] Pluralização real no cabeçalho.
- [ ] Foco preservado após repintura (por id).
- [ ] Atalhos: "/" foca a conversa; Esc fecha diálogo.

## Entrega

- [ ] Suítes verdes (unitários, desktop, e2e), smoke.
- [ ] Commit por frente, push, instalador com SHA-256.
