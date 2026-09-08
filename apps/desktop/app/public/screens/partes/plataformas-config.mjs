// Plataformas e metas da campanha: escolha, meta por plataforma e gravação.
// A meta conta só candidatura confirmada.

import { button, el, panel, staticListItem } from '../../core/dom.mjs';
import { store } from '../../core/store.mjs';
import { salvarPlataformas } from '../../core/actions.mjs';
import { notice } from '../../ui/messages.mjs';
import { rerender } from '../../core/router.mjs';

export function plataformasPanel() {
  const campanha = store.estado?.campaign ?? { platforms: [] };
  const registro = store.plataformas ?? [];
  const escolhas = new Map();

  return panel({
    kicker: 'onde procurar',
    title: 'Plataformas e metas',
    id: 'painel-plataformas',
    children: [
      el('p', { class: 'leitura apoio', text: 'A meta é contada por plataforma e só conta candidatura confirmada. Nenhuma plataforma desta versão está certificada para envio automático.' }),
      el('ul', { class: 'lista' }, registro.map((plataforma) => {
        const atual = (campanha.platforms ?? []).find((item) => item.name === plataforma.name) ?? { enabled: false, goal: 0 };
        const habilitada = el('input', { type: 'checkbox', checked: atual.enabled === true, id: `plataforma-${plataforma.name}` });
        const meta = el('input', { type: 'number', min: '0', step: '1', value: String(atual.goal ?? 0), id: `meta-${plataforma.name}`, 'aria-label': `Meta em ${plataforma.name}` });
        escolhas.set(plataforma.name, { habilitada, meta });
        return staticListItem({
          title: plataforma.name,
          detail: `Acesso: ${rotuloAuth(plataforma.auth)}`,
          right: [
            el('label', { class: 'escolha' }, [habilitada, el('span', { text: 'usar nesta campanha' })]),
            el('label', { class: 'escolha' }, [el('span', { 'aria-hidden': 'true', text: 'meta' }), meta])
          ]
        });
      })),
      el('div', { class: 'linha-acoes' }, [
        button('Salvar plataformas e metas', {
          id: 'salvar-plataformas',
          onClick: async () => {
            const plataformas = [...escolhas].map(([nome, campos]) => ({ name: nome, enabled: campos.habilitada.checked, goal: Number(campos.meta.value) || 0 }));
            try {
              const mudou = await salvarPlataformas(plataformas);
              if (!mudou) notice('Nada mudou nas plataformas e metas.', 'informacao');
              rerender();
            } catch (error) { notice(error.message, 'erro'); }
          }
        })
      ])
    ]
  });
}

function rotuloAuth(auth) {
  return { password: 'login com senha da plataforma', manual: 'login manual na janela do navegador', 'link-convite': 'somente por convite' }[auth] ?? 'não informado';
}
