// Meu perfil: o que o Fluxo entendeu, com origem, e correção no contexto.
// Nenhuma edição de Markdown (U3-03, U3-07).

import { badge, button, el, emptyState, field, panel, screen, staticListItem } from '../core/dom.mjs';
import { origemFato, valorFato } from '../core/format.mjs';
import { store } from '../core/store.mjs';
import { corrigirFato, importarCurriculo, removerFato, resolverConflito } from '../core/actions.mjs';
import { openDialog } from '../ui/dialog.mjs';
import { notice } from '../ui/messages.mjs';
import { rerender } from '../core/router.mjs';

const ROTULOS = {
  name: 'Nome', email: 'E-mail', phone: 'Telefone', location: 'Localização',
  targetRoles: 'Cargos-alvo', seniority: 'Senioridade', technicalFocus: 'Foco técnico',
  skills: 'Competências', workModes: 'Modalidades aceitas', acceptedLocations: 'Locais aceitos',
  contracts: 'Contratos aceitos', minimumSalary: 'Pretensão mínima', availability: 'Disponibilidade',
  education: 'Formação', languages: 'Idiomas', professionalSummary: 'Resumo profissional',
  strengths: 'Pontos fortes', workAuthorization: 'Autorização de trabalho', travel: 'Viagens ou mudança',
  pcd: 'Vagas PcD'
};

export function perfilScreen() {
  const memoria = store.estado?.memory ?? { facts: {}, resumes: [] };
  const fatos = Object.entries(memoria.facts ?? {});
  const confirmados = fatos.filter(([, fato]) => fato?.confirmed === true);
  const lacunas = fatos.filter(([, fato]) => fato?.confirmed !== true);
  const conflitos = (memoria.conflicts ?? []).concat(fatos.filter(([, fato]) => fato?.conflict).map(([chave, fato]) => ({ key: chave, previous: fato.value, incoming: fato.conflict?.incoming })));

  return screen({
    title: 'O que entendi sobre você',
    lead: 'Estes dados vêm do seu currículo e das suas respostas. Só o que está confirmado é usado para preencher uma candidatura.',
    children: [
      conflitos.length ? conflitosPanel(conflitos) : null,
      lacunas.length ? lacunasPanel(lacunas) : null,
      fatosPanel('Informações confirmadas', confirmados, 'Estes valores preenchem formulários. Corrigir aqui vale para as próximas candidaturas; o histórico já enviado não muda.'),
      documentosPanel(memoria)
    ]
  });
}

function fatosPanel(titulo, fatos, explicacao) {
  return panel({
    kicker: 'entendimento',
    title: titulo,
    children: [
      el('p', { class: 'leitura apoio', text: explicacao }),
      fatos.length
        ? el('dl', { class: 'fatos', id: 'fatos-confirmados' }, fatos.flatMap(([chave, fato]) => [
          el('dt', { text: ROTULOS[chave] ?? chave }),
          el('dd', { class: 'quebra' }, [
            el('p', { text: valorFato(fato) }),
            el('p', { class: 'apoio', text: origemFato(fato) })
          ]),
          el('div', { class: 'linha-acoes' }, [
            button('Corrigir', { variant: 'texto', dataset: { corrigir: chave }, 'aria-label': `Corrigir ${ROTULOS[chave] ?? chave}`, onClick: () => abrirCorrecao(chave, fato) }),
            button('Remover', { variant: 'texto', 'aria-label': `Remover ${ROTULOS[chave] ?? chave}`, onClick: () => confirmarRemocao(chave) })
          ])
        ]))
        : emptyState('Nada confirmado ainda', 'Importe seu currículo para o Fluxo ler e mostrar o que entendeu.')
    ]
  });
}

function lacunasPanel(lacunas) {
  return panel({
    kicker: 'faltando',
    title: 'Informações que ainda preciso confirmar',
    children: [
      el('p', { class: 'leitura apoio', text: 'Estes valores foram inferidos ou ficaram incompletos. Nenhum deles é usado em candidatura antes de você confirmar.' }),
      el('ul', { class: 'lista', id: 'lista-lacunas' }, lacunas.map(([chave, fato]) => staticListItem({
        title: ROTULOS[chave] ?? chave,
        support: valorFato(fato),
        detail: origemFato(fato),
        right: [
          badge('não confirmado', 'atencao'),
          button('Confirmar ou corrigir', { 'aria-label': `Confirmar ou corrigir ${ROTULOS[chave] ?? chave}`, onClick: () => abrirCorrecao(chave, fato) })
        ]
      })))
    ]
  });
}

function conflitosPanel(conflitos) {
  return panel({
    kicker: 'divergência',
    title: 'Encontrei informações que não combinam',
    children: [
      el('p', { class: 'leitura apoio', text: 'O Fluxo não escolhe sozinho entre duas versões do mesmo dado. Escolha qual vale.' }),
      el('ul', { class: 'lista', id: 'lista-conflitos' }, conflitos.map((conflito) => staticListItem({
        title: ROTULOS[conflito.key] ?? conflito.key,
        support: `em uso: ${valorFato({ value: conflito.previous })}`,
        detail: `encontrado depois: ${valorFato({ value: conflito.incoming })}`,
        right: [
          button('Manter o que está em uso', { variant: 'secundario', dataset: { manter: conflito.key }, onClick: () => resolverConflito(conflito.key, conflito.previous) }),
          button('Usar o valor encontrado', { dataset: { usar: conflito.key }, onClick: () => resolverConflito(conflito.key, conflito.incoming) })
        ]
      })))
    ]
  });
}

function documentosPanel(memoria) {
  const variantes = memoria.resumes ?? [];
  const seletor = el('input', {
    id: 'trocar-curriculo',
    type: 'file',
    accept: '.pdf,.docx,.txt',
    onChange: async (evento) => {
      const arquivo = evento.target.files?.[0];
      if (!arquivo) return;
      try { await importarCurriculo(arquivo); rerender(); } catch (error) { notice(error.message, 'erro'); }
    }
  });
  return panel({
    kicker: 'documentos',
    title: 'Currículos',
    children: [
      variantes.length
        ? el('ul', { class: 'lista', id: 'lista-curriculos' }, variantes.map((item) => staticListItem({
          title: item.label ?? item.path,
          support: item.sha256 ? `integridade conferida (${item.sha256.slice(0, 12)}…)` : 'integridade ainda não conferida',
          detail: item.source ?? 'origem não registrada',
          right: [item.selected ? badge('em uso', 'sucesso') : badge('guardado', '')]
        })))
        : el('p', { class: 'apoio', text: 'Nenhum currículo importado ainda.' }),
      field({ label: 'Substituir o currículo em uso', control: seletor, help: 'A versão anterior continua guardada. Candidaturas já enviadas mantêm o documento que foi realmente usado.' })
    ]
  });
}


function abrirCorrecao(chave, fato) {
  const entrada = el('input', { id: 'corrigir-valor', value: valorFato(fato) === 'não informado' ? '' : valorFato(fato) });
  openDialog({
    title: `Corrigir ${ROTULOS[chave] ?? chave}`,
    body: [
      field({ label: 'Valor correto', control: entrada, help: 'Ao salvar, este valor passa a ser um dado confirmado por você.' }),
      el('p', { class: 'apoio', text: 'Vale para novas candidaturas. As já enviadas continuam registradas com o que foi usado na hora.' })
    ],
    actions: [
      { label: 'Cancelar' },
      {
        label: 'Salvar correção',
        variant: 'primario',
        onSelect: async () => {
          const valor = entrada.value.trim();
          if (!valor) { notice('Escreva o valor correto para salvar.', 'atencao'); return false; }
          try { await corrigirFato(chave, valor); } catch (error) { notice(error.message, 'erro'); return false; }
          return true;
        }
      }
    ]
  });
}

function confirmarRemocao(chave) {
  openDialog({
    title: `Remover ${ROTULOS[chave] ?? chave}?`,
    body: [el('p', { class: 'leitura', text: 'O dado sai do seu perfil e deixa de preencher formulários. O histórico de candidaturas não é alterado.' })],
    actions: [
      { label: 'Manter' },
      {
        label: 'Remover do perfil',
        variant: 'perigo',
        onSelect: async () => {
          try { await removerFato(chave); } catch (error) { notice(error.message, 'erro'); return false; }
          return true;
        }
      }
    ]
  });
}
