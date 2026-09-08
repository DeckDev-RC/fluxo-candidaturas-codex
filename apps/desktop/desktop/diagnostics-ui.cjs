// Janela de preparação do ambiente. Cada dependência diz para que serve, o que
// falta e o que fazer; o estado não depende só de um símbolo (U3-06, U8-01).
const feedback = document.querySelector('#feedback');

async function refresh() {
  const workspace = await window.fluxoDesktop.workspace();
  document.querySelector('#workspace').textContent = `Pasta de dados: ${workspace.rootDir}`;
  // Se o serviço local parou, a pessoa vê o motivo e pode reiniciar sem fechar o app.
  const parada = document.querySelector('#parada');
  const reiniciar = document.querySelector('#restart');
  parada.hidden = !(workspace.ultimaParada && !workspace.running);
  if (!parada.hidden) parada.textContent = `${workspace.ultimaParada.motivo} Os detalhes estão em estado/logs/servico.log na pasta de dados e em logs/ da pasta do app.`;
  reiniciar.hidden = Boolean(workspace.running);
  const report = await window.fluxoDesktop.diagnostics();
  document.querySelector('#checks').replaceChildren(...report.checks.map((check) => {
    const row = document.createElement('li');
    row.dataset.status = check.ok ? 'ok' : 'pendente';
    const title = document.createElement('strong');
    title.textContent = check.label;
    row.append(title);
    const purpose = document.createElement('span');
    purpose.textContent = check.ok
      ? (check.detail || 'Disponível nesta máquina.')
      : (check.action || 'Resolva esta dependência e verifique novamente.');
    row.append(purpose);
    return row;
  }));
}

async function action(button, operation, sucesso) {
  const original = button.textContent;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  feedback.textContent = 'Preparando…';
  try {
    await operation();
    await refresh();
    feedback.textContent = sucesso;
  } catch (error) {
    // Instalação ou escolha cancelada não deixa a janela presa em "preparando".
    feedback.textContent = /cancel/i.test(error.message ?? '')
      ? 'Ação cancelada. Nada foi alterado.'
      : error.message;
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = original;
  }
}

document.querySelector('#refresh').onclick = (event) => action(event.target, refresh, 'Verificação concluída.');
document.querySelector('#browser').onclick = (event) => action(event.target, () => window.fluxoDesktop.installBrowser(), 'Navegador de automação instalado.');
document.querySelector('#choose').onclick = (event) => action(event.target, () => window.fluxoDesktop.selectWorkspace(), 'Pasta de dados atualizada.');
document.querySelector('#restart').onclick = (event) => action(event.target, () => window.fluxoDesktop.restartBackend(), 'Serviço reiniciado.');

refresh().catch((error) => { feedback.textContent = error.message; });
