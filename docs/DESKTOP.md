# Fluxo Desktop 1.1.0

## Instalação Windows x64

Abra `dist/desktop/Fluxo-1.1.0-Windows-x64.exe` e escolha a instalação para o usuário atual. O pacote desta entrega não possui certificado de assinatura digital. O executável desempacotado também pode ser aberto em `dist/desktop/win-unpacked/Fluxo.exe`.

O aplicativo inclui Electron, runtime Node.js e bibliotecas do navegador. No primeiro uso, abra **Fluxo → Diagnóstico e instalação**. A leitura local independe da IA. Automação exige Chromium (botão **Instalar navegador**, download pela internet) e Codex CLI no PATH; comandos de compatibilidade e extração exigem PowerShell 7. PDF pode precisar de Poppler. Instalar esses programas no sistema não é realizado silenciosamente.

O Codex CLI continua uma dependência externa: concluir OAuth pelo app autentica o App Server privado do Fluxo. A sessão do Codex usada pelo desenvolvedor não é alterada. Os testes não entram em nenhuma conta real.

## Pasta de dados

Por padrão, a pasta é `<Electron userData>/workspace`. Use **Fluxo → Escolher pasta de dados** para selecionar uma instalação existente. Currículos, perfil, evidências, bancos e `.env` ficam fora do diretório do instalador. Trocar a pasta encerra o backend anterior e inicia outro. Não selecione a pasta de instalação como pasta de dados.

O instalador não apaga os dados ao desinstalar. Fechar a última janela encerra o backend; não existe promessa de monitoramento com o aplicativo fechado. O backend usa uma porta loopback livre, não uma porta pública.

## Banco local e migração

Instalações novas usam `estado/fluxo.sqlite` para campanha, fila e candidaturas. Execuções, aprovações, eventos e coordenação ficam em `estado/harness.sqlite`. Binários de currículo/evidência permanecem em arquivos. Perfis e memória continuam locais em seus formatos existentes.

Uma instalação com JSONs existentes permanece no modo legado até migração explícita. Na tela **Operações → Dados e recuperação**, use **Migrar com backup**. A migração copia os JSONs originais para `estado/migration-backups/`, preserva IDs, datas, histórico, referências de evidência e campos extras, e muda a autoridade para SQLite. Repetir a migração não duplica registros.

Depois da migração, editar um JSON exportado gera divergência e bloqueia escritas normais. Revise o conteúdo e escolha uma opção de reconciliação na mesma tela: manter o banco ou importar os JSONs alterados. A reconciliação cria backup dos arquivos que substituirá. Nunca trate relatórios Markdown como a fonte do banco.

Pelo código-fonte:

```powershell
npm run migrate -- --root 'C:\Dados\Fluxo'
npm run migrate -- --root 'C:\Dados\Fluxo' --export
npm run migrate -- --root 'C:\Dados\Fluxo' --rollback
```

Rollback exporta o estado atual para JSON e muda a autoridade de volta para arquivos, mantendo o banco. Antes de restaurar um backup antigo, encerre o app e copie a pasta inteira; restaurar somente o banco operacional sem `harness.sqlite` e evidências pode produzir uma retomada inconsistente.

## Compatibilidade PowerShell

No modo SQLite, serviços de campanha/fila/candidatura escrevem no banco. Comandos legados de importação, testes, evidências, painel e preflight recebem uma cópia temporária do estado operacional. Alterações permitidas retornam ao SQLite de forma transacional; seus JSONs temporários não substituem a autoridade. Scripts de criação direta de candidatura são recusados pelo adaptador em modo SQLite. Executar scripts manualmente fora do app pode modificar JSONs de compatibilidade; isso exige reconciliação.

## Automação e limites

No desktop, as plataformas abrem em **abas dentro da janela do Fluxo** (`WebContentsView`, uma por plataforma, na coluna de acompanhamento). O backend liga o Playwright ao Chromium do próprio Electron por CDP: o app sobe com `--remote-debugging-port=0` (porta aleatória, só `127.0.0.1`, viva enquanto o app roda) e passa o endpoint lido de `DevToolsActivePort` ao worker. Cada aba é identificada pela URL marcadora `/aba/<PLATAFORMA>` do backend antes de navegar para a plataforma. As abas não têm preload, rodam com sandbox e permissões negadas; a sessão (login das plataformas) persiste em `userData`. Risco aceito: um processo local malicioso poderia falar com a porta de depuração; é o mesmo nível de exposição de um Chrome com depuração remota. `FLUXO_DESKTOP_SEM_NAVEGADOR_EMBUTIDO=1` desliga o modo embutido.

Robustez do ciclo de vida (auditoria de 06/09/2026): nenhum objeto Electron é tocado sem `isDestroyed()` e as abas fecham no evento `close` da janela; o processo principal e o serviço registram exceções e rejeições sem tratamento em `userData/logs/principal.log`, `userData/logs/servico-saida.log` (stdout/stderr do serviço) e `<pasta de dados>/estado/logs/servico.log`, em vez de caixa nativa; rota que lança responde 500 em JSON; fluxos SSE ignoram escrita após o fim; um Codex que morre é percebido no ato (transporte descartado e recriado no próximo pedido, turno da conversa encerrado com aviso); o supervisor identifica cada processo filho e só considera parado quem saiu de fato; a trava `estado/harness.lock` espera até 3 s por uma operação do próprio processo antes de responder ocupado. As abas das plataformas usam a partição `persist:plataformas` (cookies e armazenamento separados da interface local; o Playwright ainda as enxerga, pois páginas de contextos que ele não criou entram no contexto padrão dele). Quando o serviço local para, a tela de diagnóstico mostra o motivo e oferece "Reiniciar serviço"; quando a porta de depuração não fica disponível, a coluna de acompanhamento avisa que o navegador abre em janela separada. Risco aceito e documentado: a porta de depuração fica exposta a processos locais do mesmo usuário.

Sem Electron (`npm run start:web`, testes) ou sem a porta (`DevToolsActivePort` ausente), o driver lança um Chromium próprio com sessão persistente em `estado/browser-profile`, como antes. A CLI legada permanece disponível como adaptador. O driver captura URL, campos observados, metadados de vagas e confirmação. Os adaptadores usam JSON-LD JobPosting, os cartões de vaga de cada plataforma (`platform-cards.mjs`) ou links com empresa observada. Páginas sem estrutura reconhecível param com erro explícito; não há garantia de suporte a cada variante de DOM de cada plataforma.

O App Server recebe ferramentas de domínio registradas. Decisão de aprovação pertence à UI autenticada. Preparação e formulário revisado são persistidos; alteração posterior invalida a revisão. Um clique de resultado ambíguo exige reconciliação. Uma confirmação persistida pode ser registrada após reinício sem repetir o envio.

O sucesso dos testes controlados não representa candidaturas reais. Nenhuma conta, CAPTCHA, MFA ou plataforma de emprego foi usada na verificação. A API experimental do App Server pode mudar e deve ser validada ao atualizar Codex.

## Desenvolvimento e verificação

```powershell
npm ci
npm run browser:install
npm start
npm run start:web
npm test
npm run test:e2e
npm run test:desktop
npm run diagnose
npm run build
```

`npm test` executa testes do app e da infraestrutura desktop. `test:e2e` executa Chromium real em páginas HTTP locais e o preflight PowerShell sobre SQLite. Os screenshots ficam em `output/playwright/`. `test:desktop` abre a janela Electron com dados temporários, verifica isolamento, backend e persistência ao fechar. Para testar o executável gerado, defina `FLUXO_PACKAGED_EXE` com o caminho de `Fluxo.exe` antes do comando.

O build usa uma lista explícita de arquivos públicos. `.env`, bancos, perfil, currículos e evidências de usuário não entram no instalador. O ZIP compartilhável do menu continua sendo o pacote legado de instruções e scripts, distinto do instalador desktop.
