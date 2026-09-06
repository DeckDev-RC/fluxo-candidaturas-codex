// Abas das plataformas dentro da janela do Fluxo: uma WebContentsView por
// plataforma, só uma visível por vez, no retângulo que a interface informa.
// Sem preload e com sandbox: a página da plataforma é conteúdo de terceiros e
// nunca recebe ponte com o app. `criarView` é injetável para os testes.

const NENHUMA_AREA = { x: 0, y: 0, width: 0, height: 0 };
const PRAZO_CARREGAMENTO_MS = 5_000;

function createAbas({ window, criarView, aoMudar = () => {} }) {
  const abas = new Map();
  let area = null;
  let visivel = '';
  let avisoPendente = null;
  let ultimoAviso = '';
  let destruido = false;

  const api = {
    // Abre (ou reaproveita) a aba da plataforma e carrega a URL informada; fica oculta até `mostrar`.
    async abrir(platform, url) {
      const nome = String(platform ?? '').toUpperCase();
      if (!nome) throw new Error('Plataforma obrigatória.');
      if (destruido || !janelaViva()) throw new Error('A janela do Fluxo não está disponível.');
      let aba = abas.get(nome);
      if (aba && aba.view.webContents?.isDestroyed?.()) { abas.delete(nome); aba = null; }
      if (!aba) {
        const view = criarView();
        endurecer(view, nome);
        window.contentView.addChildView(view);
        aba = { platform: nome, view, title: '', url: '', loading: true };
        abas.set(nome, aba);
        posicionar(aba);
      }
      // Carregar a marcadora não pode segurar o pedido do serviço: com prazo curto,
      // a aba segue existindo e o driver a encontra quando a página responder.
      if (url) await Promise.race([aba.view.webContents.loadURL(String(url)).catch(() => {}), new Promise((resolve) => setTimeout(resolve, PRAZO_CARREGAMENTO_MS))]);
      notificar();
      return retrato(aba);
    },
    mostrar(platform) {
      const nome = String(platform ?? '').toUpperCase();
      if (!abas.has(nome)) return false;
      // Mostrar a aba que já está visível não mexe em nada: reordenar de novo faria piscar.
      if (visivel === nome) return true;
      visivel = nome;
      for (const aba of abas.values()) posicionar(aba);
      // A última adicionada fica por cima: reordenar traz a escolhida para a frente.
      const aba = abas.get(nome);
      if (janelaViva() && !aba.view.webContents?.isDestroyed?.()) {
        try { window.contentView.removeChildView(aba.view); window.contentView.addChildView(aba.view); } catch { /* view destruída no meio */ }
      }
      notificar();
      return true;
    },
    esconder() {
      visivel = '';
      for (const aba of abas.values()) posicionar(aba);
      notificar();
    },
    // Retângulo (coordenadas da janela) onde a aba visível deve aparecer; null oculta.
    // Valores vêm do renderer: só números finitos, não negativos e dentro de um limite sensato.
    definirArea(retangulo) {
      const numero = (valor, maximo) => { const n = Math.round(Number(valor)); return Number.isFinite(n) && n >= 0 && n <= maximo ? n : null; };
      const caixa = retangulo && typeof retangulo === 'object'
        ? { x: numero(retangulo.x, 20_000), y: numero(retangulo.y, 20_000), width: numero(retangulo.width, 20_000), height: numero(retangulo.height, 20_000) }
        : null;
      area = caixa && caixa.x !== null && caixa.y !== null && caixa.width > 0 && caixa.height > 0 ? caixa : null;
      for (const aba of abas.values()) posicionar(aba);
    },
    listar() { return [...abas.values()].map(retrato); },
    fechar(platform) {
      const nome = String(platform ?? '').toUpperCase();
      const aba = abas.get(nome);
      if (!aba) return false;
      abas.delete(nome);
      if (visivel === nome) visivel = '';
      // A janela ou a view podem já ter sido destruídas (fechamento do app): nada disso pode lançar.
      if (janelaViva()) { try { window.contentView.removeChildView(aba.view); } catch { /* já removida */ } }
      if (!aba.view.webContents?.isDestroyed?.()) { try { aba.view.webContents.close?.(); } catch { /* já fechada */ } }
      notificar();
      return true;
    },
    fecharTodas() { for (const nome of [...abas.keys()]) api.fechar(nome); },
    // Encerramento: cancela o aviso pendente e fecha tudo sem tocar em objetos destruídos.
    destruir() { clearTimeout(avisoPendente); avisoPendente = null; destruido = true; api.fecharTodas(); }
  };
  return api;

  function janelaViva() { return Boolean(window) && !(window.isDestroyed?.()) && Boolean(window.contentView); }

  // Só toca na view quando visibilidade ou limites mudaram de fato.
  function posicionar(aba) {
    const mostrar = Boolean(area) && visivel === aba.platform;
    const limites = mostrar ? area : NENHUMA_AREA;
    const chave = `${mostrar}|${limites.x}|${limites.y}|${limites.width}|${limites.height}`;
    if (aba.posicao === chave) return;
    aba.posicao = chave;
    if (aba.view.webContents?.isDestroyed?.()) return;
    try { aba.view.setVisible?.(mostrar); aba.view.setBounds(limites); } catch { /* view destruída entre a checagem e o uso */ }
  }

  function endurecer(view, nome) {
    const contents = view.webContents;
    contents.setWindowOpenHandler?.(({ url }) => { if (/^https?:\/\//i.test(url)) contents.loadURL(url).catch?.(() => {}); return { action: 'deny' }; });
    contents.session?.setPermissionRequestHandler?.((_c, _p, callback) => callback(false));
    const atualizar = () => { const aba = abas.get(nome); if (!aba) return; aba.title = contents.getTitle?.() ?? ''; aba.url = contents.getURL?.() ?? ''; notificar(); };
    contents.on?.('did-start-loading', () => { const aba = abas.get(nome); if (aba) { aba.loading = true; notificar(); } });
    contents.on?.('did-stop-loading', () => { const aba = abas.get(nome); if (aba) { aba.loading = false; } atualizar(); });
    contents.on?.('page-title-updated', atualizar);
    contents.on?.('did-navigate', atualizar);
    contents.on?.('did-navigate-in-page', atualizar);
  }

  function retrato(aba) { return { platform: aba.platform, title: aba.title, url: aba.url, loading: aba.loading, visible: visivel === aba.platform }; }

  // Eventos de carregamento chegam em rajada; a interface recebe um retrato por vez, e só se mudou.
  function notificar() {
    if (avisoPendente || destruido) return;
    avisoPendente = setTimeout(() => {
      avisoPendente = null;
      if (destruido) return;
      const lista = api.listar();
      const chave = JSON.stringify(lista);
      if (chave === ultimoAviso) return;
      ultimoAviso = chave;
      try { aoMudar(lista); } catch { /* ouvinte não pode derrubar as abas */ }
    }, 80);
  }
}

module.exports = { createAbas };
