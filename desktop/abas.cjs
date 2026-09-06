// Abas das plataformas dentro da janela do Fluxo: uma WebContentsView por
// plataforma, só uma visível por vez, no retângulo que a interface informa.
// Sem preload e com sandbox: a página da plataforma é conteúdo de terceiros e
// nunca recebe ponte com o app. `criarView` é injetável para os testes.

const NENHUMA_AREA = { x: 0, y: 0, width: 0, height: 0 };

function createAbas({ window, criarView, aoMudar = () => {} }) {
  const abas = new Map();
  let area = null;
  let visivel = '';

  const api = {
    // Abre (ou reaproveita) a aba da plataforma e carrega a URL informada; fica oculta até `mostrar`.
    async abrir(platform, url) {
      const nome = String(platform ?? '').toUpperCase();
      if (!nome) throw new Error('Plataforma obrigatória.');
      let aba = abas.get(nome);
      if (!aba) {
        const view = criarView();
        endurecer(view, nome);
        window.contentView.addChildView(view);
        aba = { platform: nome, view, title: '', url: '', loading: true };
        abas.set(nome, aba);
        posicionar(aba);
      }
      if (url) await aba.view.webContents.loadURL(String(url)).catch(() => {});
      notificar();
      return retrato(aba);
    },
    mostrar(platform) {
      const nome = String(platform ?? '').toUpperCase();
      if (!abas.has(nome)) return false;
      visivel = nome;
      for (const aba of abas.values()) posicionar(aba);
      // A última adicionada fica por cima: reordenar traz a escolhida para a frente.
      const aba = abas.get(nome);
      window.contentView.removeChildView(aba.view);
      window.contentView.addChildView(aba.view);
      notificar();
      return true;
    },
    esconder() {
      visivel = '';
      for (const aba of abas.values()) posicionar(aba);
      notificar();
    },
    // Retângulo (coordenadas da janela) onde a aba visível deve aparecer; null oculta.
    definirArea(retangulo) {
      area = retangulo && retangulo.width > 0 && retangulo.height > 0
        ? { x: Math.round(retangulo.x), y: Math.round(retangulo.y), width: Math.round(retangulo.width), height: Math.round(retangulo.height) }
        : null;
      for (const aba of abas.values()) posicionar(aba);
    },
    listar() { return [...abas.values()].map(retrato); },
    fechar(platform) {
      const nome = String(platform ?? '').toUpperCase();
      const aba = abas.get(nome);
      if (!aba) return false;
      window.contentView.removeChildView(aba.view);
      aba.view.webContents.close?.();
      abas.delete(nome);
      if (visivel === nome) visivel = '';
      notificar();
      return true;
    },
    fecharTodas() { for (const nome of [...abas.keys()]) api.fechar(nome); }
  };
  return api;

  function posicionar(aba) {
    const mostrar = Boolean(area) && visivel === aba.platform;
    aba.view.setVisible?.(mostrar);
    aba.view.setBounds(mostrar ? area : NENHUMA_AREA);
  }

  function endurecer(view, nome) {
    const contents = view.webContents;
    contents.setWindowOpenHandler?.(({ url }) => { if (/^https?:\/\//i.test(url)) void contents.loadURL(url); return { action: 'deny' }; });
    contents.session?.setPermissionRequestHandler?.((_c, _p, callback) => callback(false));
    const atualizar = () => { const aba = abas.get(nome); if (!aba) return; aba.title = contents.getTitle?.() ?? ''; aba.url = contents.getURL?.() ?? ''; notificar(); };
    contents.on?.('did-start-loading', () => { const aba = abas.get(nome); if (aba) { aba.loading = true; notificar(); } });
    contents.on?.('did-stop-loading', () => { const aba = abas.get(nome); if (aba) { aba.loading = false; } atualizar(); });
    contents.on?.('page-title-updated', atualizar);
    contents.on?.('did-navigate', atualizar);
    contents.on?.('did-navigate-in-page', atualizar);
  }

  function retrato(aba) { return { platform: aba.platform, title: aba.title, url: aba.url, loading: aba.loading, visible: visivel === aba.platform }; }
  function notificar() { try { aoMudar(api.listar()); } catch { /* ouvinte não pode derrubar as abas */ } }
}

module.exports = { createAbas };
