import type { ReactNode } from 'react'

export interface ExplainCtx {
  op: string
  args: any[]
  /** Valor de un argumento por su nombre en CyberChef. */
  arg: (name: string) => any
  inBytes: Uint8Array
  inStr: string
  outStr: string
  outBytes: Uint8Array
}

export function Verify({ ok, extra }: { ok: boolean; extra?: string }) {
  return ok ? (
    <p className="my-2 inline-block rounded border border-ok/40 bg-ok/10 px-2.5 py-1 text-[11.5px] text-ok">✓ La reconstrucción coincide con el resultado real de CyberChef.</p>
  ) : (
    <p className="my-2 inline-block rounded border border-red/40 bg-red/10 px-2.5 py-1 text-[11.5px] text-red">
      ⚠ La reconstrucción didáctica no coincide para estos parámetros{extra ? ` (${extra})` : ''}. El resultado válido es el de Salida.
    </p>
  )
}

export const More = ({ shown, total, unit }: { shown: number; total: number; unit: string }) =>
  total > shown ? <p className="mt-1 text-[11px] text-muted">Se muestran {shown} de {total} {unit}.</p> : null

export const P = ({ children }: { children: ReactNode }) => <p className="my-2 max-w-[78ch] text-[13px] leading-relaxed">{children}</p>
export const Note = ({ children }: { children: ReactNode }) => <p className="my-1.5 max-w-[78ch] text-[11.5px] text-muted">{children}</p>
export const H = ({ children }: { children: ReactNode }) => <h4 className="mb-1 mt-5 text-[13px] font-bold">{children}</h4>

export function Table({ heads, rows }: { heads: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="tbl">
        <thead><tr>{heads.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

/** Bits coloreados por byte de origen y agrupados de a `group`. */
export function Bits({ bytes, n, group = 6 }: { bytes: number[]; n: number; group?: number }) {
  const bits: { b: string; c: string }[] = []
  bytes.forEach((x, k) => x.toString(2).padStart(8, '0').split('').forEach(b => bits.push({ b, c: k < n ? 'c' + k : 'cz' })))
  const groups: typeof bits[] = []
  for (let i = 0; i < bits.length; i += group) groups.push(bits.slice(i, i + group))
  return <span className="bits whitespace-nowrap">{groups.map((g, i) => <span key={i} className="g">{g.map((x, j) => <span key={j} className={x.c}>{x.b}</span>)}</span>)}</span>
}
