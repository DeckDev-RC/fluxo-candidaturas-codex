export function mountPersistence(mutationHeaders) {
  const panel = document.createElement('section'); panel.className = 'panel';
  const heading = document.createElement('h2'); heading.textContent = 'Dados e recuperação';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const description = document.createElement('p'); description.textContent = 'A migração guarda uma cópia dos arquivos originais. Depois dela, o banco local mantém campanha, fila e histórico; JSONs são cópias de compatibilidade.';
  panel.append(heading, description, status);
  const actions = document.createElement('div'); actions.className = 'form-actions'; panel.append(actions);
  let current;
  const buttons = [
    ['Atualizar diagnóstico', '', {}],
    ['Migrar com backup', 'migrate', {}],
    ['Exportar cópias JSON', 'export', {}],
    ['Manter banco e restaurar JSONs', 'reconcile', { strategy: 'sqlite_wins' }],
    ['Importar alterações dos JSONs', 'reconcile', { strategy: 'import_legacy' }]
  ].map(([label, operation, payload]) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.onclick = async () => {
      if (operation === 'reconcile' && !window.confirm('Esta ação resolve a divergência usando a fonte escolhida. Você revisou as alterações e tem uma cópia de segurança?')) return;
      button.disabled = true;
      try {
        if (operation) {
          const response = await fetch(`/api/v1/persistence/${operation}`, { method: 'POST', headers: mutationHeaders({ 'content-type': 'application/json' }), body: JSON.stringify(payload) });
          const result = await response.json(); if (!response.ok) throw new Error(result.error?.message || 'Não foi possível atualizar os dados.');
        }
        await refresh();
      } catch (error) { status.textContent = error.message; } finally { button.disabled = false; }
    };
    actions.append(button); return { button, operation };
  });
  async function refresh() {
    const response = await fetch('/api/v1/persistence'); if (!response.ok) return;
    current = await response.json();
    status.textContent = `Fonte atual: ${current.mode === 'sqlite' ? 'banco local SQLite' : 'arquivos JSON'}. ${current.divergences?.length ? 'Há arquivos alterados fora do app; revise e escolha como reconciliar.' : 'Nenhuma divergência detectada.'}`;
    for (const { button, operation } of buttons) button.hidden = operation === 'migrate' ? current.mode === 'sqlite' : operation === 'reconcile' ? !current.divergences?.length : operation === 'export' ? current.mode !== 'sqlite' : false;
  }
  document.querySelector('[data-view="operations"]')?.append(panel);
  window.addEventListener('hashchange', () => { if (location.hash === '#operations') void refresh(); });
  void refresh();
}
