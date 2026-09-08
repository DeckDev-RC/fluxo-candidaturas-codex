// Primeiro uso: objetivo em linguagem natural, importação real do currículo e
// escolha das plataformas, em um único cartão. Transferência, leitura e revisão
// do currículo são etapas distintas (U3-01, U3-02).

import { badge, button, el, field, panel, screen } from '../core/dom.mjs';
import { store } from '../core/store.mjs';
import { iniciarJornada, importarCurriculo } from '../core/actions.mjs';
import { clearDraft, draftBound } from '../core/drafts.mjs';
import { notice } from '../ui/messages.mjs';
import { go, rerender } from '../core/router.mjs';
import { platformChooser } from './partes/plataformas-escolha.mjs';

// Estado da importação em curso nesta sessão; o que está persistido vem do documento.
let etapas = etapasIniciais();
let arquivo = null;
let nomeArquivo = '';
let erroObjetivo = '';
let erroPlataformas = '';

function etapasIniciais() { return { selecionado: 'pendente', importado: 'pendente', lido: 'pendente', confirmado: 'pendente' }; }

export function primeiroUsoScreen() {
  const retorno = Boolean(store.perfil?.profile?.exists) || Object.values(store.estado?.memory?.facts ?? {}).some((fato) => fato?.confirmed === true);
  return screen({
    title: retorno ? 'Iniciar uma nova busca' : 'Diga o que você procura',
    lead: retorno ? 'Confirme o objetivo, o currículo em uso e onde procurar. O que já está confirmado no seu perfil continua valendo.' : 'Objetivo, currículo e onde procurar. O resto eu pergunto só quando precisar.',
    children: firstRunPanel()
  });
}

export function firstRunPanel() {
  const objetivoSalvo = store.estado?.memory?.facts?.targetRoles?.value ?? '';
  const documento = (store.estado?.memory?.resumes ?? []).find((item) => item.selected);
  // O persistido manda: com documento em uso, as etapas vêm dele; sem documento e sem
  // importação em curso, tudo volta a pendente (ex.: depois de remover dados).
  if (documento) {
    etapas = { selecionado: 'feito', importado: 'feito', lido: documento.sha256 ? 'feito' : 'pendente', confirmado: store.estado?.memory?.facts?.name?.confirmed ? 'feito' : 'pendente' };
  } else if (!arquivo && !nomeArquivo) {
    etapas = etapasIniciais();
  }

  const objetivo = draftBound(el('textarea', {
    id: 'objetivo',
    name: 'objetivo',
    rows: 2,
    placeholder: 'Ex.: quero vagas remotas de análise de dados, começando em até um mês',
    value: [objetivoSalvo].flat().join(', ')
  }), 'objetivo');

  const plataformas = platformChooser();

  return panel({
    kicker: 'objetivo e currículo',
    title: 'Começar a jornada',
    id: 'painel-primeiro-uso',
    children: [
      field({ label: 'O que você quer alcançar?', control: objetivo, error: erroObjetivo, help: 'Com suas palavras. Dá para mudar depois.' }),
      el('fieldset', { class: 'campo grupo' }, [
        el('legend', { text: 'Seu currículo' }),
        seletorDeArquivo(documento),
        (arquivo || documento) ? etapasDoDocumento() : null,
        documento ? documentoEmUso(documento) : null
      ]),
      el('fieldset', { class: 'campo grupo', dataset: { erro: erroPlataformas ? 'true' : 'false' } }, [
        el('legend', { text: 'Onde procurar' }),
        plataformas.node,
        erroPlataformas && el('span', { class: 'campo-erro', text: erroPlataformas })
      ]),
      el('div', { class: 'linha-acoes' }, [
        button('Começar', { id: 'comecar', onClick: (evento) => comecar(evento, objetivo, plataformas) }),
        el('span', { class: 'apoio', text: politicaTexto() })
      ])
    ]
  });
}

// Botão com a língua do produto sobre o seletor nativo (escondido, mas focável).
function seletorDeArquivo(documento) {
  const entrada = el('input', {
    id: 'curriculo',
    class: 'arquivo-oculto',
    type: 'file',
    accept: '.pdf,.docx,.txt',
    onChange: async (evento) => {
      arquivo = evento.target.files?.[0] ?? null;
      nomeArquivo = arquivo?.name ?? '';
      if (!arquivo) { etapas.selecionado = 'pendente'; rerender(); return; }
      etapas.selecionado = 'feito';
      try {
        const resultado = await importarCurriculo(arquivo);
        etapas.importado = 'feito';
        etapas.lido = resultado.extraction?.ok === false ? 'falha' : 'feito';
        arquivo = null;
      } catch (error) {
        // O arquivo recusado não fica pendurado para o "Começar" tentar de novo.
        etapas.importado = 'falha';
        arquivo = null;
        notice(error.message, 'erro');
      }
      rerender();
    }
  });
  return el('div', { class: 'arquivo' }, [
    entrada,
    el('label', { class: 'botao botao-secundario', for: 'curriculo', text: (nomeArquivo || documento) ? 'Trocar currículo' : 'Importar currículo' }),
    el('span', { class: 'apoio quebra', text: nomeArquivo || 'PDF, DOCX ou TXT. É armazenado localmente; a IA recebe o conteúdo somente quando você pedir análise.' })
  ]);
}

function etapasDoDocumento() {
  return el('div', { class: 'documento-etapas', id: 'documento-etapas' }, [
    el('span', { dataset: { estado: etapas.selecionado }, text: '1. Arquivo escolhido' }),
    el('span', { dataset: { estado: etapas.importado }, text: '2. Transferido e verificado' }),
    el('span', { dataset: { estado: etapas.lido }, text: '3. Lido pelo Fluxo' }),
    el('span', { dataset: { estado: etapas.confirmado }, text: '4. Revisado por você' })
  ]);
}

function documentoEmUso(documento) {
  return el('div', { class: 'documento' }, [
    badge('em uso', 'sucesso'),
    el('div', {}, [
      el('p', { class: 'item-titulo quebra', text: documento.label ?? documento.path }),
      el('p', { class: 'item-apoio', text: documento.sha256 ? `Verificação do arquivo: ${documento.sha256.slice(0, 12)}…` : 'Leitura ainda não concluída' })
    ]),
    button('Revisar o que entendi', { variant: 'secundario', onClick: () => go('perfil') })
  ]);
}

async function comecar(evento, objetivo, plataformas) {
  const texto = objetivo.value.trim();
  erroObjetivo = texto ? '' : 'Escreva o que você quer alcançar para eu poder buscar.';
  erroPlataformas = plataformas.habilitadas() ? '' : 'Marque ao menos uma plataforma para eu saber onde procurar.';
  if (erroObjetivo || erroPlataformas) {
    rerender();
    document.querySelector(erroObjetivo ? '#objetivo' : '#plataformas-escolha input')?.focus();
    return;
  }
  const botao = evento.currentTarget;
  botao.disabled = true;
  botao.setAttribute('aria-busy', 'true');
  try {
    await iniciarJornada({ objetivo: texto, curriculo: arquivo, plataformas: plataformas.valor() });
    clearDraft('objetivo');
    go('agora');
  } catch (error) {
    notice(error.message, 'erro');
  } finally {
    botao.disabled = false;
    botao.removeAttribute('aria-busy');
  }
}

function politicaTexto() {
  const confirmacao = store.politica?.policy?.requireFinalConfirmation !== false;
  return confirmacao ? 'Cada envio pede sua confirmação.' : 'Envio automático autorizado por você.';
}
