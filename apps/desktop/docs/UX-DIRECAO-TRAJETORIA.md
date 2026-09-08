# Direção visual Trajetória — guia de tokens e componentes

Entregável de U1 do [checklist de repaginação](../../docs/CHECKLIST-REPAGINACAO-UI-UX.md). Descreve a direção implementada na versão 1.2.0 e o racional de cada decisão. A escolha entre direções alternativas e o aceite visual continuam pendentes de decisão humana (U1-01, U1-02, U10-06).

## 1. Tese

Uma mesa de trabalho editorial para a trajetória profissional: superfícies claras, tipografia legível, estrutura firme e um traço de percurso que marca a etapa ativa. A identidade está na composição e nas interações, não em decoração.

O que a direção recusa: foto decorativa, gradiente, vidro, sombra em todo bloco, órbita de IA, avatar de robô e painel de ficção científica. Também recusa a solução fácil de trocar a cor e manter a mesma composição — a arquitetura de informação mudou junto.

## 2. Assinatura visual

O símbolo é um traço que sobe, atravessa e termina em um ponto: a passagem entre etapas com um destino. Aparece como marca na navegação, como `favicon.svg` e como motivo do percurso da jornada (`.percurso .marco`) e da área ativa na navegação (traço de 3px à esquerda do item).

**Pendente:** ícone raster do aplicativo Windows. O instalador 1.2.0 ainda usa o ícone padrão do Electron; substituir exige o arquivo de imagem da marca.

## 3. Tokens

Arquivo: `app/public/styles/tokens.css`. Contraste verificado por teste automatizado em `app/test/ui-design-system.test.mjs`.

### Cor

| Token | Valor | Uso | Contraste medido |
|---|---|---|---|
| `--mineral` | `#f4f3ef` | superfície da aplicação | base |
| `--papel` | `#ffffff` | painéis, listas e campos | base |
| `--tinta` | `#20262b` | texto principal e anel de foco | 13,7:1 sobre mineral |
| `--tinta-media` | `#4d565d` | texto de apoio | 7,3:1 sobre mineral |
| `--terracota` | `#b44832` | ação principal e identidade | 4,9:1 sobre mineral; 5,4:1 com texto branco |
| `--sucesso` | `#1f6b4a` | confirmação observada | 5,9:1 |
| `--atencao` | `#8a5a00` | pendência e pausa | 5,3:1 |
| `--erro` | `#a32116` | falha e bloqueio | 6,8:1 |
| `--informacao` | `#2c5c8a` | contexto neutro | 6,3:1 |
| `--linha-controle` | `#8c8578` | borda de campo e botão | 3,7:1 sobre papel |

A cor da marca nunca substitui função de risco: sucesso, atenção, erro e informação têm cor própria, e todo indicador traz rótulo em texto.

### Tipografia

Pilha do sistema (`Segoe UI Variable Text`, `Segoe UI`, `system-ui`). Escolhida por estar disponível offline, não exigir licença adicional, cobrir os caracteres do português e distinguir bem `1/l` e `0/O` no Windows. Uma única família; números em variante tabular onde há comparação.

Escala: 0,75 / 0,8125 / 0,9375 / 1,0625 / 1,375 / 1,75 rem. Altura de linha 1,35 para títulos e 1,55 para leitura.

### Espaçamento, borda, elevação e movimento

Escala de 4 (`--e1` a `--e7`). Raios 3/6/10 px. Elevação só em painel flutuante e diálogo — blocos usam borda. Movimento de 120 ms e 200 ms, zerado por `prefers-reduced-motion`.

## 4. Componentes e estados

Arquivos: `app/public/styles/components.css` e `app/public/core/dom.mjs`.

| Componente | Estados cobertos |
|---|---|
| Botão | normal, hover, foco, ocupado (`aria-busy`), desabilitado, perigo, texto |
| Campo | normal, ajuda, erro com mensagem, desabilitado, arquivo, seleção múltipla |
| Lista | vazia com explicação, item selecionado, item longo com quebra, hover, foco |
| Aba/navegação | ativa com traço de percurso, hover, foco |
| Indicador (selo) | neutro, sucesso, atenção, erro, informação, ação — sempre com rótulo |
| Percurso | não começou, em andamento, esperando você, precisa de atenção, concluída |
| Documento | escolhido, transferido e verificado, lido, revisado, falha |
| Diálogo | foco inicial, Escape, retorno de foco ao gatilho, ações à direita |
| Painel de detalhe | aberto, fechado, coluna única em janela estreita |
| Aviso | informação, atenção, erro, sucesso — persistente, com dispensa explícita |

Estados adicionais tratados: alto contraste do sistema (`forced-colors`), texto longo (`overflow-wrap`), atalho para o conteúdo e região de mensagens com `aria-live`.

## 5. Composição

Navegação lateral compacta com quatro áreas do candidato e dois itens de apoio. Coluna de trabalho em três faixas: cabeçalho com objetivo ativo e indicador de decisões, área de trabalho com rolagem própria e conversa em faixa própria. Nada flutua sobre o conteúdo, então nenhuma ação fica coberta — verificado por teste em 1024×768, 1366×768, 1920×1080 e no equivalente a 200% de zoom.

Abaixo de 68 rem a navegação vira faixa horizontal e o detalhe ocupa a página. Abaixo de 48 rem o espaçamento reduz. O mínimo da janela Electron foi baixado para 720×560 para permitir essa adaptação.

## 6. Módulos da interface

| Pasta | Responsabilidade |
|---|---|
| `core/` | api, estado, rotas, stream de eventos, rascunhos, formatação, ações |
| `ui/` | mensagens persistentes, diálogo, padrão lista + detalhe |
| `screens/` | uma área por arquivo: agora, oportunidades, candidaturas, perfil, decisões, configurações, ajuda, primeiro uso |
| `styles/` | tokens, base, layout, componentes |

O comportamento deixou de depender de um único script global. Nenhum módulo usa `innerHTML`: conteúdo vindo de página de vaga é sempre texto, nunca marcação.

## 7. Evidência desta direção

| Item | Evidência |
|---|---|
| Tokens, contraste e componentes | `app/test/ui-design-system.test.mjs` |
| Módulos servidos e sem travessia de caminho | `app/test/static-assets.test.mjs` |
| Estados da tela Agora | `app/test/ui-estados-agora.test.mjs` |
| Teclado, foco, diálogo, zoom, movimento reduzido, demonstração identificada | `e2e/ui-experiencia.test.mjs` |
| Jornada completa pela interface | `e2e/production-journey.test.mjs` |
| Aplicativo empacotado abrindo na nova interface | `desktop/smoke.mjs` |
| Telas por estado | `output/playwright/e2e/ui-*.png`, `output/playwright/desktop/development.png` |

## 8. Pendências desta direção

- Comparação com uma segunda exploração visual e escolha registrada (U1-01, U1-02).
- Ícone do aplicativo com a marca (parte de U1-03).
- Verificação com leitor de tela (U8-02).
- Teste de usabilidade com pelo menos cinco pessoas e aceite visual (U10-01 a U10-03, U10-06).
