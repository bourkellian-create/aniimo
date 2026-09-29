/**
 * Traitements sur des images brutes 4 octets/pixel (BGRA d'Electron ou RGBA) :
 * l'ordre des canaux n'a pas d'importance, on ne regarde que la luminosité.
 */

function luminance(buf, i) {
  return (buf[i] + buf[i + 1] + buf[i + 2]) / 3;
}

/**
 * Empreinte « dHash » 64 bits d'une image réduite à 9×8 pixels.
 * Deux images proches ont une petite distance de Hamming.
 */
export function dHash(bitmap, width = 9, height = 8) {
  let hash = 0n;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const left = luminance(bitmap, (y * width + x) * 4);
      const right = luminance(bitmap, (y * width + x + 1) * 4);
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return hash.toString(16).padStart(16, '0');
}

export function hamming(a, b) {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0;
  while (x) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/**
 * Prépare une image pour l'OCR : niveaux de gris, texte sombre sur fond clair
 * (l'interface du jeu est surtout en texte clair sur fond sombre) et contraste étiré.
 * Renvoie un nouveau buffer du même format.
 */
export function prepareForOcr(bitmap) {
  const out = Buffer.alloc(bitmap.length);
  let sum = 0;
  let min = 255;
  let max = 0;
  const gray = new Float32Array(bitmap.length / 4);
  for (let p = 0; p < gray.length; p++) {
    const v = luminance(bitmap, p * 4);
    gray[p] = v;
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const invert = sum / gray.length < 128;
  const range = Math.max(1, max - min);
  for (let p = 0; p < gray.length; p++) {
    let v = ((gray[p] - min) / range) * 255;
    if (invert) v = 255 - v;
    out[p * 4] = out[p * 4 + 1] = out[p * 4 + 2] = v;
    out[p * 4 + 3] = 255;
  }
  return out;
}
