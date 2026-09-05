// Primeiro uso: objetivo em linguagem natural e importação real do currículo.
// Transferência, leitura e revisão são etapas distintas (U3-01, U3-02).

import { badge, button, el, field, panel } from '../core/dom.mjs';
import { store } from '../core/store.mjs';
import { iniciarJornada, importarCurriculo } from '../core/actions.mjs';
import { clearDraft, draftBound } from '../core/drafts.mjs';
import { notice } from '../ui/messages.mjs';
import { go, rerender } from '../core/router.mjs';

const etapas = { selecionado: 'pendente', importado: 'pendente', lido: 'pendente', confirmado: 'pendente' };
let arquivo = null;
let erroObjetivo = '';

export function primeiroUsoScreen() {
  return el('div', { class: 'area', style: 'padding:0' }, [
    el('div', { class: 'area-titulo' }, [
      el('p', { class: 'etiqueta', text: 'começar' }),
      el('h1', { text: 'Diga o que você procura' }),
      el('p', { class: 'leitura secundario', text: 'Duas informações bastam para começar: o que você quer alcançar e o seu currículo. O Fluxo pergunta o resto só quando precisar.' })
    ]),
    firstRunPanel(),
    plataformasPanel()
  ]);
}

export function firstRunPanel() {
  const objetivoSalvo = store.estado?.memory?.facts?.targetRoles?.value ?? '';
  const documento = (store.estado?.memory?.resumes ?? []).find((item) => item.selected);
  if (documento) {
    etapas.selecionado = 'feito';
    etapas.importado = 'feito';
    etapas.lido = documento.sha256 ? 'feito' : 'pendente';
    etapas.confirmado = store.estado?.memory?.facts?.name?.confirmed ? 'feito' : 'pendente';
  }

  const objetivo = draftBound(el('textarea', {
    id: 'objetivo',
    name: 'objetivo',
    rows: 2,
    placeholder: 'Ex.: quero vagas remotas de análise de dados, começando em até um mês',
    value: [objetivoSalvo].flat().join(', ')
  }), 'objetivo');

  const seletor = el('input', {
    id: 'curriculo',
    type: 'file',
    accept: '.pdf,.docx,.txt',
    onChange: async (evento) => {
      arquivo = evento.target.files?.[0] ?? null;
      if (!arquivo) { etapas.selecionado = 'pendente'; rerender(); return; }
      etapas.selecionado = 'feito';
      try {
        const resultado = await importarCurriculo(arquivo);
        etapas.importado = 'feito';
        etapas.lido = resultado.extraction?.ok === false ? 'falha' : 'feito';
        arquivo = null;
      } catch (error) {
        etapas.importado = 'falha';
        notice(error.message, 'erro');
      }
      rerender();
    }
  });

  return panel({
    kicker: 'objetivo e currículo',
    title: 'Começar a jornada',
    id: 'painel-primeiro-uso',
    children: [
      field({ label: 'O que você quer alcançar?', control: objetivo, error: erroObjetivo, help: 'Escreva com suas palavras. Você pode mudar depois; a alteração vale para as próximas buscas.' }),
      field({ label: 'Seu currículo', control: seletor, help: 'Aceita PDF, DOCX ou TXT de qualquer pasta do computador. O arquivo é copiado para a pasta privada do Fluxo e verificado antes de ser usado.' }),
      el('div', { class: 'documento-etapas', id: 'documento-etapas' }, [
        el('span', { dataset: { estado: etapas.selecionado }, text: '1. Arquivo escolhido' }),
        el('span', { dataset: { estado: etapas.importado }, text: '2. Transferido e verificado' }),
        el('span', { dataset: { estado: etapas.lido }, text: '3. Lido pelo Fluxo' }),
        el('span', { dataset: { estado: etapas.confirmado }, text: '4. Revisado por você' })
      ]),
      documento
        ? el('div', { class: 'documento' }, [
          badge('em uso', 'sucesso'),
          el('div', {}, [
            el('p', { class: 'item-titulo quebra', text: documento.label ?? documento.path }),
            el('p', { class: 'item-apoio', text: documento.sha256 ? `Verificação do arquivo: ${documento.sha256.slice(0, 12)}…` : 'Leitura ainda não concluída' })
          ]),
          button('Revisar o que entendi', { variant: 'secundario', onClick: () => go('perfil') })
        ])
        : el('p', { class: 'apoio', text: 'Nenhum currículo em uso. Informar apenas o nome de um arquivo não importa o conteúdo.' }),
      el('div', { class: 'linha-acoes' }, [
        button('Começar', {
          id: 'comecar',
          onClick: async (evento) => {
            const texto = objetivo.value.trim();
            if (!texto) {
              erroObjetivo = 'Escreva o que você quer alcançar para o Fluxo poder buscar.';
              rerender();
              document.querySelector('#objetivo')?.focus();
              return;
            }
            erroObjetivo = '';
            const botao = evento.currentTarget;
            botao.disabled = true;
            botao.setAttribute('aria-busy', 'true');
            try {
              await iniciarJornada({ objetivo: texto, curriculo: arquivo });
              clearDraft('objetivo');
              go('agora');
            } catch (error) {
              notice(error.message, 'erro');
            } finally {
              botao.disabled = false;
              botao.removeAttribute('aria-busy');
            }
          }
        }),
        el('span', { class: 'apoio', text: politicaTexto() })
      ])
    ]
  });
}

function plataformasPanel() {
  const habilitadas = (store.estado?.campaign?.platforms ?? []).filter((item) => item.enabled !== false);
  return panel({
    kicker: 'antes de iniciar',
    title: 'Onde vou procurar e o que preciso da sua autorização',
    children: [
      habilitadas.length
        ? el('ul', { class: 'lista' }, habilitadas.map((item) => el('li', {}, [
          el('div', { class: 'item-lista', role: 'none', style: 'cursor:default' }, [
            el('div', {}, [
              el('p', { class: 'item-titulo', text: item.name }),
              el('p', { class: 'item-apoio', text: `Meta desta plataforma: ${item.goal ?? 0} candidaturas confirmadas` })
            ]),
            el('div', { class: 'item-direita' }, [badge('assistida', 'informacao')])
          ])
        ])))
        : el('p', { class: 'apoio', text: 'Nenhuma plataforma habilitada ainda. Escolha em Configurações antes de buscar.' }),
      el('p', { class: 'leitura apoio', text: 'Nenhuma plataforma desta versão está certificada para envio automático. O Fluxo prepara a candidatura e para para você revisar.' }),
      el('div', { class: 'linha-acoes' }, [
        button('Ajustar plataformas e limites', { variant: 'secundario', onClick: () => go('configuracoes') })
      ])
    ]
  });
}

function politicaTexto() {
  const limites = store.politica?.limits ?? {};
  const confirmacao = store.politica?.policy?.requireFinalConfirmation !== false;
  return `${confirmacao ? 'Cada envio pede sua confirmação.' : 'Envio automático autorizado por você.'} Limite: ${limites.maxApplicationsPerRun ?? 30} candidaturas por execução.`;
}
