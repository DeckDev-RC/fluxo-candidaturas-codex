const feedback = document.querySelector('#feedback');
async function refresh() {
  const workspace = await window.fluxoDesktop.workspace();
  document.querySelector('#workspace').textContent = `Pasta de dados: ${workspace.rootDir}`;
  const report = await window.fluxoDesktop.diagnostics();
  document.querySelector('#checks').replaceChildren(...report.checks.map(check => {
    const row = document.createElement('li'); const title = document.createElement('strong');
    title.textContent = `${check.ok ? '✓' : '○'} ${check.label}${check.ok ? ' disponível' : ' pendente'}`;
    row.append(title);
    if (!check.ok) { const detail = document.createElement('span'); detail.textContent = check.action; row.append(detail); }
    return row;
  }));
}
async function action(button, operation) {
  button.disabled = true; feedback.textContent = 'Preparando…';
  try { await operation(); await refresh(); feedback.textContent = 'Verificação concluída.'; }
  catch (error) { feedback.textContent = error.message; }
  finally { button.disabled = false; }
}
document.querySelector('#refresh').onclick = event => action(event.target, refresh);
document.querySelector('#browser').onclick = event => action(event.target, () => window.fluxoDesktop.installBrowser());
document.querySelector('#choose').onclick = event => action(event.target, () => window.fluxoDesktop.selectWorkspace());
refresh().catch(error => { feedback.textContent = error.message; });
