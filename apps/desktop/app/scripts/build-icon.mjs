import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Gera o ícone do aplicativo a partir da mesma marca da interface (favicon.svg):
// quadrado de tinta com o traço que sobe e desce. Sem dependência de biblioteca
// gráfica, para o build continuar reproduzível offline.

const TAMANHO = 256;
const TINTA = [17, 17, 19];
const BRANCO = [255, 255, 255];

const TABELA_CRC = Array.from({ length: 256 }, (_, indice) => {
  let valor = indice;
  for (let bit = 0; bit < 8; bit += 1) valor = valor & 1 ? 0xedb88320 ^ (valor >>> 1) : valor >>> 1;
  return valor >>> 0;
});

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const destino = join(raiz, 'build');
await mkdir(destino, { recursive: true });
await writeFile(join(destino, 'icon.png'), png(desenhar()));
console.log(`Ícone gerado: build/icon.png (${TAMANHO}×${TAMANHO}, marca do Fluxo).`);

function desenhar() {
  const pixels = Buffer.alloc(TAMANHO * TAMANHO * 4);
  const raioCanto = TAMANHO * 0.25;
  const espessura = TAMANHO * 0.094;

  for (let y = 0; y < TAMANHO; y += 1) {
    for (let x = 0; x < TAMANHO; x += 1) {
      const indice = (y * TAMANHO + x) * 4;
      if (!dentroDoCantoArredondado(x, y, raioCanto)) { pixels.writeUInt32BE(0, indice); continue; }

      const cor = distanciaAoTraco(x, y) <= espessura / 2 ? BRANCO : TINTA;

      pixels[indice] = cor[0];
      pixels[indice + 1] = cor[1];
      pixels[indice + 2] = cor[2];
      pixels[indice + 3] = 255;
    }
  }
  return pixels;
}

// Traço: sobe da esquerda, cruza o centro e desce à direita, como a passagem
// entre etapas da jornada. Mesma curva do favicon.svg (M7 19.5 C… 16 11.5 s… 25 19.5).
function distanciaAoTraco(x, y) {
  let menor = Infinity;
  for (let passo = 0; passo <= 200; passo += 1) {
    const t = passo / 200;
    const ponto = curva(t);
    const distancia = Math.hypot(x - ponto.x, y - ponto.y);
    if (distancia < menor) menor = distancia;
  }
  return menor;
}

function curva(t) {
  // Bézier cúbica em coordenadas relativas ao tamanho do ícone.
  const p = [
    { x: 0.22, y: 0.61 },
    { x: 0.36, y: 0.61 },
    { x: 0.36, y: 0.36 },
    { x: 0.50, y: 0.36 }
  ];
  const q = [
    { x: 0.50, y: 0.36 },
    { x: 0.64, y: 0.36 },
    { x: 0.64, y: 0.61 },
    { x: 0.78, y: 0.61 }
  ];
  const controles = t <= 0.5 ? p : q;
  const local = t <= 0.5 ? t * 2 : (t - 0.5) * 2;
  const u = 1 - local;
  const x = u ** 3 * controles[0].x + 3 * u ** 2 * local * controles[1].x + 3 * u * local ** 2 * controles[2].x + local ** 3 * controles[3].x;
  const y = u ** 3 * controles[0].y + 3 * u ** 2 * local * controles[1].y + 3 * u * local ** 2 * controles[2].y + local ** 3 * controles[3].y;
  return { x: x * TAMANHO, y: y * TAMANHO };
}

function dentroDoCantoArredondado(x, y, raio) {
  const cantos = [[raio, raio], [TAMANHO - raio, raio], [raio, TAMANHO - raio], [TAMANHO - raio, TAMANHO - raio]];
  for (const [cx, cy] of cantos) {
    const foraNoEixoX = (cx === raio && x < raio) || (cx !== raio && x > TAMANHO - raio);
    const foraNoEixoY = (cy === raio && y < raio) || (cy !== raio && y > TAMANHO - raio);
    if (foraNoEixoX && foraNoEixoY) return Math.hypot(x - cx, y - cy) <= raio;
  }
  return true;
}

function png(pixels) {
  const cru = Buffer.alloc((TAMANHO * 4 + 1) * TAMANHO);
  for (let y = 0; y < TAMANHO; y += 1) {
    cru[y * (TAMANHO * 4 + 1)] = 0;
    pixels.copy(cru, y * (TAMANHO * 4 + 1) + 1, y * TAMANHO * 4, (y + 1) * TAMANHO * 4);
  }
  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(TAMANHO, 0);
  cabecalho.writeUInt32BE(TAMANHO, 4);
  cabecalho[8] = 8;
  cabecalho[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloco('IHDR', cabecalho),
    bloco('IDAT', deflateSync(cru, { level: 9 })),
    bloco('IEND', Buffer.alloc(0))
  ]);
}

function bloco(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length, 0);
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const verificacao = Buffer.alloc(4);
  verificacao.writeUInt32BE(crc32(corpo), 0);
  return Buffer.concat([tamanho, corpo, verificacao]);
}

function crc32(buffer) {
  let valor = 0xffffffff;
  for (const byte of buffer) valor = TABELA_CRC[(valor ^ byte) & 0xff] ^ (valor >>> 8);
  return (valor ^ 0xffffffff) >>> 0;
}
