import { bin8, chShow, expandAlphabet, fromHex, hx, toHex } from '../lib/bytes'
import { Bits, More, Note, P, Table, Verify, type ExplainCtx } from './common'

function b64Groups(bytes: Uint8Array, A: string, pad: string) {
  const rows: { g: number; n: number; bb: number[]; idx: number[]; chars: string[] }[] = []
  let out = ''
  for (let g = 0; g < bytes.length; g += 3) {
    const n = Math.min(3, bytes.length - g), bb = [bytes[g], bytes[g + 1] || 0, bytes[g + 2] || 0]
    const v = (bb[0] << 16) | (bb[1] << 8) | bb[2]
    const idx = [18, 12, 6, 0].map(s => (v >>> s) & 63)
    const chars = idx.map((x, k) => (k <= n ? A[x] : pad))
    out += chars.join('')
    rows.push({ g: g / 3, n, bb, idx, chars })
  }
  return { rows, out }
}

export function ToBase64({ ctx }: { ctx: ExplainCtx }) {
  const al = expandAlphabet(ctx.arg('Alphabet') || 'A-Za-z0-9+/=')
  const A = al.slice(0, 64), pad = al[64] || ''
  const { rows, out } = b64Groups(ctx.inBytes, A, pad)
  const show = rows.slice(0, 14)
  return (
    <>
      <P>Base64 toma los bytes de tres en tres (24 bits) y los reparte en cuatro grupos de 6 bits. Cada grupo es un número entre 0 y 63 que se usa como índice en un alfabeto de 64 caracteres. Si al final sobran 1 o 2 bytes, se completan con ceros y se agrega relleno.</P>
      <Note>Colores: <span className="c0">byte 1</span>, <span className="c1">byte 2</span>, <span className="c2">byte 3</span>, <span className="cz">ceros de relleno</span>.</Note>
      <Table heads={['Grupo', 'Bytes', '24 bits en grupos de 6', 'Índices', 'Caracteres']} rows={show.map(r => [
        r.g + 1,
        <span className="whitespace-nowrap">{r.bb.slice(0, r.n).map((b, k) => <span key={k} className={'c' + k}>{hx(b)} «{chShow(b)}» </span>)}</span>,
        <Bits bytes={r.bb} n={r.n} />,
        r.idx.map((x, k) => (k <= r.n ? x : '—')).join(', '),
        <b>{r.chars.join('')}</b>,
      ])} />
      <More shown={show.length} total={rows.length} unit="grupos" />
      <Note>Alfabeto usado ({A.length} caracteres): {A}{pad && ` con relleno «${pad}»`}</Note>
      <Verify ok={ctx.outStr === out} />
    </>
  )
}

export function FromBase64({ ctx }: { ctx: ExplainCtx }) {
  const al = expandAlphabet(ctx.arg('Alphabet') || 'A-Za-z0-9+/=')
  const A = al.slice(0, 64)
  const clean = [...ctx.inStr].filter(c => A.includes(c)).join('')
  const out: number[] = []
  const rows = []
  for (let g = 0; g < clean.length; g += 4) {
    const ch = clean.slice(g, g + 4), idx = [...ch].map(x => A.indexOf(x))
    while (idx.length < 4) idx.push(-1)
    const nb = ch.length - 1
    const v = idx.reduce((a, x) => (a << 6) | (x < 0 ? 0 : x), 0)
    const bytes = [(v >>> 16) & 255, (v >>> 8) & 255, v & 255].slice(0, Math.max(0, nb))
    out.push(...bytes)
    rows.push([g / 4 + 1, <b>{ch}</b>, idx.map(x => (x < 0 ? '—' : x)).join(', '),
      <span className="bits whitespace-nowrap">{idx.map((x, k) => <span key={k} className="g">{x < 0 ? <span className="cz">······</span> : bin8(x).slice(2)}</span>)}</span>,
      <span className="whitespace-nowrap">{bytes.map((b, k) => <span key={k}>{hx(b)} «{chShow(b)}» </span>)}</span>])
  }
  return (
    <>
      <P>Es el camino inverso: cada carácter se reemplaza por su posición en el alfabeto (6 bits). Se juntan de cuatro en cuatro para formar 24 bits, que se vuelven a partir en tres bytes. El relleno indica cuántos bytes reales tenía el último grupo.</P>
      <Table heads={['Grupo', 'Caracteres', 'Índices', 'Bits (6 por carácter)', 'Bytes']} rows={rows.slice(0, 14)} />
      <More shown={Math.min(14, rows.length)} total={rows.length} unit="grupos" />
      <Verify ok={toHex(Uint8Array.from(out)) === toHex(ctx.outBytes)} extra="quizá por caracteres fuera del alfabeto" />
    </>
  )
}

export function ToHex({ ctx }: { ctx: ExplainCtx }) {
  const b = ctx.inBytes
  return (
    <>
      <P>Cada byte (8 bits) se parte en dos mitades de 4 bits llamadas nibbles. Cada nibble vale de 0 a 15 y se escribe con un solo dígito hexadecimal (0–9 y a–f). Por eso cada byte ocupa exactamente dos caracteres.</P>
      <Table heads={['#', 'Carácter', 'Decimal', 'Binario (alto | bajo)', 'Hex']} rows={Array.from(b.subarray(0, 24), (x, i) => [
        i, chShow(x), x,
        <span className="whitespace-nowrap"><span className="c0">{bin8(x).slice(0, 4)}</span> | <span className="c1">{bin8(x).slice(4)}</span></span>,
        <b><span className="c0">{hx(x)[0]}</span><span className="c1">{hx(x)[1]}</span></b>,
      ])} />
      <More shown={Math.min(24, b.length)} total={b.length} unit="bytes" />
      <Verify ok={ctx.outStr.replace(/[^0-9a-f]/gi, '').toLowerCase().startsWith(toHex(b.subarray(0, 64)))} />
    </>
  )
}

export function FromHex({ ctx }: { ctx: ExplainCtx }) {
  const s = ctx.inStr.replace(/0x/gi, '').replace(/[^0-9a-f]/gi, '')
  const rows = []
  for (let i = 0; i + 1 < s.length && rows.length < 24; i += 2) {
    const v = parseInt(s.substr(i, 2), 16)
    rows.push([i / 2, <b><span className="c0">{s[i]}</span><span className="c1">{s[i + 1]}</span></b>,
      <span><span className="c0">{bin8(v).slice(0, 4)}</span><span className="c1">{bin8(v).slice(4)}</span></span>, v, chShow(v)])
  }
  return (
    <>
      <P>Se leen los dígitos hexadecimales de dos en dos. El primero son los 4 bits altos y el segundo los 4 bajos; juntos forman un byte.</P>
      <Table heads={['#', 'Dígitos', 'Binario', 'Decimal', 'Carácter']} rows={rows} />
      <More shown={rows.length} total={Math.floor(s.length / 2)} unit="bytes" />
      <Verify ok={toHex(fromHex(s)) === toHex(ctx.outBytes)} extra="el separador elegido puede excluir parte de la entrada" />
    </>
  )
}

export function ToBinary({ ctx }: { ctx: ExplainCtx }) {
  const b = ctx.inBytes
  return (
    <>
      <P>Cada byte es un número entre 0 y 255 que se escribe en base 2 con 8 posiciones. Cada posición vale el doble que la de su derecha: 128, 64, 32, 16, 8, 4, 2, 1. El byte es la suma de las posiciones que tienen un 1.</P>
      <Table heads={['Car.', 'Decimal', '128', '64', '32', '16', '8', '4', '2', '1', 'Suma']} rows={Array.from(b.subarray(0, 16), x => {
        const bits = bin8(x).split('')
        return [chShow(x), x, ...bits.map((q, k) => q === '1' ? <b key={k} className="one px-1">1</b> : '0'), bits.map((q, k) => (q === '1' ? 128 >> k : 0)).filter(Boolean).join(' + ') || '0']
      })} />
      <More shown={Math.min(16, b.length)} total={b.length} unit="bytes" />
    </>
  )
}
