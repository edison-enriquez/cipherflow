// Implementación didáctica de AES que registra cada transformación del estado.
// Se usa solo para explicar; el resultado válido siempre es el de CyberChef.
export interface AesStep { name: string; round: number; before: Uint8Array; after: Uint8Array; key?: Uint8Array }
export interface KeySchedule { Nr: number; rk: Uint8Array[] }

const xt = (a: number) => ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 255
const EXP = new Uint8Array(512), LOG = new Uint8Array(256)
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x ^= xt(x) } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255] }
export const gmul = (a: number, b: number) => a && b ? EXP[LOG[a] + LOG[b]] : 0

export const SBOX = new Uint8Array(256), INV_SBOX = new Uint8Array(256)
{
  const rl = (q: number, n: number) => ((q << n) | (q >>> (8 - n))) & 255
  for (let i = 0; i < 256; i++) {
    const v = i ? EXP[255 - LOG[i]] : 0
    const s = v ^ rl(v, 1) ^ rl(v, 2) ^ rl(v, 3) ^ rl(v, 4) ^ 0x63
    SBOX[i] = s; INV_SBOX[s] = i
  }
}
const RC = [1, 2, 4, 8, 16, 32, 64, 128, 27, 54, 108, 216, 171, 77]
export const MIX = [[2, 3, 1, 1], [1, 2, 3, 1], [1, 1, 2, 3], [3, 1, 1, 2]]
export const INV_MIX = [[14, 11, 13, 9], [9, 14, 11, 13], [13, 9, 14, 11], [11, 13, 9, 14]]

export function expandKey(key: Uint8Array): KeySchedule {
  const Nk = key.length / 4, Nr = Nk + 6, w: number[][] = []
  for (let i = 0; i < Nk; i++) w.push(Array.from(key.slice(4 * i, 4 * i + 4)))
  for (let i = Nk; i < 4 * (Nr + 1); i++) {
    let t = w[i - 1].slice()
    if (i % Nk === 0) { t = [t[1], t[2], t[3], t[0]].map(b => SBOX[b]); t[0] ^= RC[i / Nk - 1] }
    else if (Nk > 6 && i % Nk === 4) t = t.map(b => SBOX[b])
    w.push(w[i - Nk].map((b, j) => b ^ t[j]))
  }
  const rk: Uint8Array[] = []
  for (let r = 0; r <= Nr; r++) rk.push(Uint8Array.from([...w[4 * r], ...w[4 * r + 1], ...w[4 * r + 2], ...w[4 * r + 3]]))
  return { Nr, rk }
}

const sub = (s: Uint8Array, T: Uint8Array) => s.map(b => T[b])
const shift = (s: Uint8Array, inv: boolean) => {
  const o = new Uint8Array(16)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[r + 4 * c] = s[r + 4 * (inv ? (c - r + 4) % 4 : (c + r) % 4)]
  return o
}
const mix = (s: Uint8Array, M: number[][]) => {
  const o = new Uint8Array(16)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let v = 0; for (let k = 0; k < 4; k++) v ^= gmul(M[r][k], s[k + 4 * c]); o[r + 4 * c] = v }
  return o
}
const ark = (s: Uint8Array, k: Uint8Array) => s.map((b, i) => b ^ k[i])

export function aesBlock(block: Uint8Array, ks: KeySchedule, decrypt: boolean, record: boolean) {
  let s: Uint8Array = Uint8Array.from(block)
  const steps: AesStep[] = []
  const R = (name: string, round: number, after: Uint8Array, key?: Uint8Array) => { if (record) steps.push({ name, round, before: s, after, key }); s = after }
  const { Nr, rk } = ks
  if (!decrypt) {
    R('AddRoundKey', 0, ark(s, rk[0]), rk[0])
    for (let r = 1; r <= Nr; r++) {
      R('SubBytes', r, sub(s, SBOX)); R('ShiftRows', r, shift(s, false))
      if (r < Nr) R('MixColumns', r, mix(s, MIX))
      R('AddRoundKey', r, ark(s, rk[r]), rk[r])
    }
  } else {
    R('AddRoundKey', Nr, ark(s, rk[Nr]), rk[Nr])
    for (let r = Nr - 1; r >= 0; r--) {
      R('InvShiftRows', r, shift(s, true)); R('InvSubBytes', r, sub(s, INV_SBOX))
      R('AddRoundKey', r, ark(s, rk[r]), rk[r])
      if (r > 0) R('InvMixColumns', r, mix(s, INV_MIX))
    }
  }
  return { out: s, steps }
}

const xorB = (a: Uint8Array, b: Uint8Array) => a.map((x, i) => x ^ b[i])
function inc32(c: Uint8Array) { const o = Uint8Array.from(c); for (let i = 15; i >= 12; i--) { o[i] = (o[i] + 1) & 255; if (o[i]) break } return o }

export interface ModeBlock { i: number; inp: Uint8Array; prev: Uint8Array; aesIn: Uint8Array; aesOut: Uint8Array; res: Uint8Array }

/** Recorre los bloques de un modo de operación como lo hace node-forge (motor de CyberChef). */
export function modeTrace(mode: string, decrypt: boolean, ks: KeySchedule, iv: Uint8Array, data: Uint8Array, noPad: boolean) {
  const E = (b: Uint8Array) => aesBlock(b, ks, false, false).out
  const D = (b: Uint8Array) => aesBlock(b, ks, true, false).out
  const blocks: ModeBlock[] = []
  let buf: Uint8Array = Uint8Array.from(data), padN = 0
  const padded = (mode === 'CBC' || mode === 'ECB') && !noPad
  if (!decrypt && padded) { padN = 16 - (buf.length % 16); const b = new Uint8Array(buf.length + padN); b.set(buf); b.fill(padN, buf.length); buf = b }
  let prev: Uint8Array = Uint8Array.from(iv)
  const out: number[] = []
  for (let i = 0; i < buf.length; i += 16) {
    const blk = buf.subarray(i, i + 16), full = blk.length === 16
    const rec = { i: i / 16, inp: blk, prev } as ModeBlock
    if (mode === 'ECB') { rec.aesIn = blk; rec.aesOut = decrypt ? D(blk) : E(blk); rec.res = rec.aesOut }
    else if (mode === 'CBC') {
      if (!decrypt) { rec.aesIn = xorB(blk, prev); rec.aesOut = E(rec.aesIn); rec.res = rec.aesOut; prev = rec.res }
      else { rec.aesIn = blk; rec.aesOut = D(blk); rec.res = xorB(rec.aesOut, prev); prev = Uint8Array.from(blk) }
    } else {
      rec.aesIn = prev; rec.aesOut = E(prev)
      rec.res = xorB(Uint8Array.from(blk), rec.aesOut.subarray(0, blk.length))
      if (mode === 'CFB') prev = full ? (decrypt ? Uint8Array.from(blk) : rec.res) : prev
      else if (mode === 'OFB') prev = rec.aesOut
      else prev = inc32(prev)
    }
    blocks.push(rec); out.push(...rec.res)
  }
  let res: Uint8Array = Uint8Array.from(out)
  if (decrypt && padded && res.length) { padN = res[res.length - 1]; if (padN > 0 && padN <= 16) res = res.subarray(0, res.length - padN) }
  return { blocks, padN, padded: buf, res }
}
