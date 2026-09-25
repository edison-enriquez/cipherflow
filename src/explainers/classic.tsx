import { bin8, chShow, hx, toHex, toggleBytes } from '../lib/bytes'
import { More, Note, P, Table, Verify, type ExplainCtx } from './common'

export function Xor({ ctx }: { ctx: ExplainCtx }) {
  const key = ctx.arg('Key') ?? { string: '', option: 'Hex' }
  const k = toggleBytes(key.string, key.option), scheme = ctx.arg('Scheme'), nullp = ctx.arg('Null preserving'), b = ctx.inBytes
  if (!k.length) return <P>La clave está vacía, así que la salida es igual a la entrada.</P>
  if (scheme !== 'Standard') return <P>El esquema «{scheme}» encadena bytes entre sí; la tabla detallada solo se muestra para el esquema Standard.</P>
  const out: number[] = []
  const rows = []
  for (let i = 0; i < b.length; i++) {
    const kb = k[i % k.length]
    let o = b[i] ^ kb
    if (nullp && (b[i] === 0 || b[i] === kb)) o = b[i]
    out.push(o)
    if (i < 20) rows.push([i,
      <span>{hx(b[i])} «{chShow(b[i])}»<br /><span className="text-muted">{bin8(b[i])}</span></span>,
      <span>{hx(kb)} <span className="text-muted">(clave[{i % k.length}])</span><br /><span className="text-muted">{bin8(kb)}</span></span>,
      <span><b>{hx(o)}</b> «{chShow(o)}»<br />{bin8(o).split('').map((q, j) => q === '1' ? <span key={j} className="one">1</span> : <span key={j}>0</span>)}</span>])
  }
  return (
    <>
      <P>XOR (o exclusivo) compara bit a bit: el resultado es 1 cuando los bits son distintos y 0 cuando son iguales. La clave se repite a lo largo del mensaje. Aplicar XOR dos veces con la misma clave devuelve el original, por eso sirve para cifrar y descifrar.</P>
      <Note>Resaltados: los bits que quedaron en 1 en el resultado.</Note>
      <Table heads={['#', 'Entrada', '⊕ Clave', '= Resultado']} rows={rows} />
      <More shown={rows.length} total={b.length} unit="bytes" />
      <Verify ok={toHex(Uint8Array.from(out)) === toHex(ctx.outBytes)} />
    </>
  )
}

export function Rot13({ ctx }: { ctx: ExplainCtx }) {
  const lo = ctx.arg('Rotate lower case chars'), up = ctx.arg('Rotate upper case chars'), num = ctx.arg('Rotate numbers'), amt = +ctx.arg('Amount') || 0
  const a = ((amt % 26) + 26) % 26
  let out = ''
  const rows = []
  for (const ch of ctx.inStr) {
    let o = ch
    const c = ch.charCodeAt(0)
    if (up && c >= 65 && c <= 90) o = String.fromCharCode(65 + (c - 65 + a) % 26)
    else if (lo && c >= 97 && c <= 122) o = String.fromCharCode(97 + (c - 97 + a) % 26)
    else if (num && c >= 48 && c <= 57) o = String.fromCharCode(48 + (((c - 48 + amt) % 10) + 10) % 10)
    out += o
    if (rows.length < 20 && /[A-Za-z0-9]/.test(ch)) rows.push([<b>{ch}</b>, /[A-Za-z]/.test(ch) ? ch.toUpperCase().charCodeAt(0) - 65 : 'dígito', o === ch ? 'sin cambio' : `+${amt}`, <b>{o}</b>])
  }
  const cell = 'border border-border bg-elevated py-1'
  return (
    <>
      <P>Cada letra se desplaza {amt} posiciones en el alfabeto, dando la vuelta al llegar a la Z. Los demás caracteres no cambian{num ? ' (salvo los dígitos, que se desplazan dentro de 0–9)' : ''}. Con 13 posiciones, aplicarlo dos veces devuelve el original, porque 13 + 13 = 26.</P>
      <div className="my-2 grid max-w-[740px] grid-cols-[repeat(26,minmax(16px,1fr))] gap-0.5 text-center text-[11px]">
        {Array.from({ length: 26 }, (_, i) => <div key={'t' + i} className={cell}>{String.fromCharCode(65 + i)}</div>)}
        {Array.from({ length: 26 }, (_, i) => <div key={'b' + i} className={`${cell} border-green/40 bg-green/10 text-green`}>{String.fromCharCode(65 + (i + a) % 26)}</div>)}
      </div>
      <Table heads={['Letra', 'Posición', 'Desplazamiento', 'Resultado']} rows={rows} />
      <Verify ok={out === ctx.outStr} />
    </>
  )
}

function vigenere(ctx: ExplainCtx, dec: boolean) {
  const key = String(ctx.arg('Key') || '').toLowerCase().replace(/[^a-z]/g, '')
  if (!key) return <P>Escribe una clave con letras para ver el proceso.</P>
  let j = 0, out = ''
  const rows = []
  for (const ch of ctx.inStr) {
    if (/[A-Za-z]/.test(ch)) {
      const base = ch <= 'Z' ? 65 : 97, s = key.charCodeAt(j % key.length) - 97
      const o = String.fromCharCode((ch.charCodeAt(0) - base + (dec ? 26 - s : s)) % 26 + base)
      if (rows.length < 20) rows.push([<b>{ch}</b>, `${key[j % key.length].toUpperCase()} (${s})`, `${dec ? '−' : '+'}${s}`, <b>{o}</b>])
      out += o; j++
    } else out += ch
  }
  return (
    <>
      <P>Vigenère usa una palabra clave: cada letra de la clave indica cuánto {dec ? 'retroceder' : 'avanzar'} la letra correspondiente del mensaje (A = 0, B = 1, …, Z = 25). La clave avanza solo con las letras; espacios y signos se copian tal cual.</P>
      <Table heads={['Letra', 'Letra de la clave', 'Desplazamiento', 'Resultado']} rows={rows} />
      <Verify ok={out === ctx.outStr} />
    </>
  )
}
export const VigenereEncode = ({ ctx }: { ctx: ExplainCtx }) => vigenere(ctx, false)
export const VigenereDecode = ({ ctx }: { ctx: ExplainCtx }) => vigenere(ctx, true)
