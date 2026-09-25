// SHA-256 didáctico: guarda el relleno, el programa de mensajes y cada ronda.
export interface ShaRound { t: number; W: number; K: number; v: number[] }
export interface ShaBlock { W: number[]; rows: ShaRound[]; Hin: number[]; Hout: number[] }

const primes: number[] = []
for (let n = 2; primes.length < 64; n++) if (primes.every(p => n % p)) primes.push(n)
const frac = (x: number) => Math.floor((x - Math.floor(x)) * 4294967296) >>> 0
export const K = primes.map(p => frac(Math.cbrt(p)))
export const H0 = primes.slice(0, 8).map(p => frac(Math.sqrt(p)))
const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))

export function sha256Trace(bytes: Uint8Array, rounds = 64) {
  const L = bytes.length, total = ((L + 9 + 63) >> 6) << 6
  const buf = new Uint8Array(total)
  buf.set(bytes); buf[L] = 0x80
  const dv = new DataView(buf.buffer)
  dv.setUint32(total - 8, Math.floor(L / 0x20000000)); dv.setUint32(total - 4, (L * 8) >>> 0)
  let H = H0.slice()
  const blocks: ShaBlock[] = []
  for (let o = 0; o < total; o += 64) {
    const W: number[] = []
    for (let t = 0; t < 16; t++) W[t] = dv.getUint32(o + 4 * t)
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3)
      const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10)
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = H
    const rows: ShaRound[] = [], Hin = H.slice()
    for (let t = 0; t < rounds; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g)
      const T1 = (h + S1 + ch + K[t] + W[t]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), mj = (a & b) ^ (a & c) ^ (b & c)
      const T2 = (S0 + mj) >>> 0
      h = g; g = f; f = e; e = (d + T1) >>> 0; d = c; c = b; b = a; a = (T1 + T2) >>> 0
      rows.push({ t, W: W[t], K: K[t], v: [a, b, c, d, e, f, g, h] })
    }
    H = H.map((x, i) => (x + [a, b, c, d, e, f, g, h][i]) >>> 0)
    blocks.push({ W, rows, Hin, Hout: H.slice() })
  }
  return { L, total, padded: buf, blocks, hex: H.map(x => x.toString(16).padStart(8, '0')).join('') }
}
