import { DataTexture, LinearFilter, RepeatWrapping, RGBAFormat, UnsignedByteType } from 'three';

function smooth(t: number) { return t * t * (3 - 2 * t); }
function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, seed: number, period: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi);
  const w = (v: number) => ((v % period) + period) % period;
  const a = hash(w(xi), w(yi), seed), b = hash(w(xi + 1), w(yi), seed), c = hash(w(xi), w(yi + 1), seed), d = hash(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

function make(size: number, data: Uint8Array): DataTexture {
  const t = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  t.magFilter = LinearFilter; t.minFilter = LinearFilter; t.needsUpdate = true;
  return t;
}

/** Soft, noisy cloud puff: white with alpha falling off from the center. */
export function puffTexture(size = 128): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const u = (i / size) * 2 - 1, v = (j / size) * 2 - 1;
    const r = Math.hypot(u, v);
    const n = 0.55 * vnoise(i / 14, j / 14, 3, 1000) + 0.3 * vnoise(i / 6, j / 6, 5, 1000) + 0.15 * vnoise(i / 3, j / 3, 9, 1000);
    const a = Math.max(0, Math.min(1, (1 - r) * 1.6 * (0.55 + n * 0.9)));
    const shade = 255 * (0.82 + 0.18 * (1 - (j / size)));
    const k = (j * size + i) * 4;
    data[k] = shade; data[k + 1] = shade; data[k + 2] = Math.min(255, shade + 6); data[k + 3] = 255 * smooth(a);
  }
  return make(size, data);
}

/** Radial dark falloff for cloud shadows on the water. */
export function shadowTexture(size = 64): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const r = Math.hypot((i / size) * 2 - 1, (j / size) * 2 - 1);
    const a = smooth(Math.max(0, Math.min(1, (1 - r) / 0.35)));
    const k = (j * size + i) * 4;
    data[k] = 8; data[k + 1] = 20; data[k + 2] = 30; data[k + 3] = 255 * a;
  }
  return make(size, data);
}

/** Tileable wave normal map from summed value noise. */
export function waterNormalTexture(size = 256): DataTexture {
  const h = new Float32Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    h[j * size + i] = vnoise(i / 32, j / 32, 1, 8) * 0.6 + vnoise(i / 16, j / 16, 2, 16) * 0.3 + vnoise(i / 8, j / 8, 4, 32) * 0.1;
  }
  const data = new Uint8Array(size * size * 4);
  const at = (i: number, j: number) => h[((j + size) % size) * size + ((i + size) % size)];
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const dx = at(i + 1, j) - at(i - 1, j), dy = at(i, j + 1) - at(i, j - 1);
    const nx = -dx * 6, ny = -dy * 6, nz = 1, l = Math.hypot(nx, ny, nz);
    const k = (j * size + i) * 4;
    data[k] = 255 * (nx / l * 0.5 + 0.5); data[k + 1] = 255 * (ny / l * 0.5 + 0.5); data[k + 2] = 255 * (nz / l * 0.5 + 0.5); data[k + 3] = 255;
  }
  const t = make(size, data);
  t.wrapS = RepeatWrapping; t.wrapT = RepeatWrapping;
  return t;
}
