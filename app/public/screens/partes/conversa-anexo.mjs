// Currículo pela conversa: o botão de anexo ou arrastar um arquivo até a área
// importa o documento pelo mesmo caminho do primeiro uso e avisa a IA, que lê e
// confirma os dados. É o onboarding sem sair do chat.

import { describeError } from '../../core/api.mjs';
import { importarCurriculo } from '../../core/actions.mjs';
import { agentOperating, sendTurn } from '../../core/conversa-ia.mjs';
import { ask, say, settleSteps } from '../../core/conversa.mjs';
import { currentRoute, go } from '../../core/router.mjs';

const ACEITOS = /\.(pdf|docx|txt)$/i;

export function ligarAnexoNaConversa(form) {
  const arquivo = form.querySelector('#conversa-arquivo');
  if (!arquivo) return;
  arquivo.addEventListener('change', async () => {
    const [escolhido] = arquivo.files ?? [];
    arquivo.value = '';
    if (escolhido) await receberArquivo(escolhido);
  });
  // Arrastar para qualquer ponto da área de trabalho ou da barra de escrita.
  const alvo = document.querySelector('.coluna-trabalho') ?? document.body;
  let contador = 0;
  alvo.addEventListener('dragenter', (evento) => { if (temArquivo(evento)) { contador += 1; alvo.dataset.arrastando = 'true'; } });
  alvo.addEventListener('dragleave', () => { contador = Math.max(0, contador - 1); if (!contador) delete alvo.dataset.arrastando; });
  alvo.addEventListener('dragover', (evento) => { if (temArquivo(evento)) evento.preventDefault(); });
  alvo.addEventListener('drop', async (evento) => {
    if (!temArquivo(evento)) return;
    evento.preventDefault();
    contador = 0;
    delete alvo.dataset.arrastando;
    const [solto] = evento.dataTransfer.files;
    if (solto) await receberArquivo(solto);
  });
}

function temArquivo(evento) { return [...(evento.dataTransfer?.types ?? [])].includes('Files'); }

async function receberArquivo(file) {
  if (currentRoute() !== 'agora') go('agora');
  if (!ACEITOS.test(file.name)) { say(`Não consigo ler "${file.name}". Envie o currículo em PDF, DOCX ou TXT.`, { tom: 'atencao' }); return; }
  ask(`Anexei o currículo: ${file.name}`);
  say(`Recebendo ${file.name}…`, { tom: 'passo', emAndamento: true });
  try {
    const resultado = await importarCurriculo(file);
    const lido = resultado.extraction?.ok !== false;
    // O aviso da importação já entrou na conversa; o passo "Recebendo…" só fecha.
    settleSteps();
    if (!lido) say(`A leitura do texto de ${resultado.filename} não terminou; posso tentar de novo ou você envia em outro formato.`, { tom: 'atencao' });
    if (agentOperating()) {
      await sendTurn(`A pessoa anexou o currículo "${resultado.filename}" pela conversa e ele já foi importado (${lido ? 'texto extraído' : 'texto não extraído'}). Leia-o com fluxo_read_resume e confirme os dados com o cartão (AÇÃO: confirmar=…). Não peça o arquivo de novo.`, { system: true }).catch(() => null);
    }
  } catch (error) {
    settleSteps();
    say(describeError(error), { tom: 'erro' });
  }
}
