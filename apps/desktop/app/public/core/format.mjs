// Datas, frescor e valores em português do Brasil (U7-03).
// "Verificado hoje às 14h" só aparece quando houve observação real.

const DATA_HORA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const HORA = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' });
const DATA = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });

export function dataHora(valor) {
  const data = paraData(valor);
  return data ? DATA_HORA.format(data) : 'não informado';
}

export function hora(valor) {
  const data = paraData(valor);
  return data ? HORA.format(data) : '';
}

export function dataLonga(valor) {
  const data = paraData(valor);
  return data ? DATA.format(data) : 'não informado';
}

export function frescor(valor, { prefixo = 'Verificado' } = {}) {
  const data = paraData(valor);
  if (!data) return 'Sem verificação registrada';
  const agora = new Date();
  const mesmoDia = data.toDateString() === agora.toDateString();
  if (mesmoDia) return `${prefixo} hoje às ${HORA.format(data)}`;
  const ontem = new Date(agora);
  ontem.setDate(agora.getDate() - 1);
  if (data.toDateString() === ontem.toDateString()) return `${prefixo} ontem às ${HORA.format(data)}`;
  return `${prefixo} em ${DATA_HORA.format(data)}`;
}

export function duracao(milissegundos) {
  const total = Number(milissegundos);
  if (!Number.isFinite(total) || total <= 0) return 'não informado';
  const minutos = Math.round(total / 60000);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

export function numero(valor) {
  const number = Number(valor);
  return Number.isFinite(number) ? number.toLocaleString('pt-BR') : '0';
}

export function salario(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return 'faixa não informada';
  return texto;
}

export function valorFato(fato) {
  const valor = fato?.value ?? fato;
  if (Array.isArray(valor)) return valor.join(', ');
  if (valor === undefined || valor === null || valor === '') return 'não informado';
  return String(valor);
}

export function origemFato(fato) {
  const origem = fato?.sourceLabel || fato?.source || 'origem não registrada';
  const quando = fato?.extractedAt ? ` · ${dataHora(fato.extractedAt)}` : '';
  return `${origem}${quando}`;
}

export function listaLegivel(valores) {
  const itens = [valores].flat().map((item) => String(item ?? '').trim()).filter(Boolean);
  if (!itens.length) return '';
  if (itens.length === 1) return itens[0];
  return `${itens.slice(0, -1).join(', ')} e ${itens.at(-1)}`;
}

function paraData(valor) {
  if (!valor) return null;
  // Data sem hora ("2026-09-10") é local, não UTC: senão vira o dia anterior no Brasil.
  const bruto = typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? `${valor}T00:00:00` : valor;
  const data = bruto instanceof Date ? bruto : new Date(bruto);
  return Number.isNaN(data.getTime()) ? null : data;
}
