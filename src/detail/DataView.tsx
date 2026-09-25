import { useState } from 'react'
import { bin8, chShow, fromUtf8, hexdump, hx, isPrintable } from '../lib/bytes'

type Mode = 'auto' | 'text' | 'hex' | 'bytes' | 'view'
const LABEL: Record<Mode, string> = { auto: 'Automático', text: 'Texto', hex: 'Hex', bytes: 'Bytes', view: 'Vista de CyberChef' }

/** Muestra un dato como texto, volcado hexadecimal, tabla de bytes o la vista enriquecida de CyberChef. */
export default function DataView({ bytes, html }: { bytes: Uint8Array; html?: string | null }) {
  const modes: Mode[] = ['auto', 'text', 'hex', 'bytes', ...(html ? ['view' as Mode] : [])]
  const [mode, setMode] = useState<Mode>(html ? 'view' : 'auto')
  const cur = modes.includes(mode) ? mode : 'auto'
  const printable = isPrintable(bytes.subarray(0, 4000))

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap">
        {modes.map((m, i) => (
          <button key={m} className={`btn px-2 py-1 text-[10px] ${i ? '-ml-px' : ''} ${m === cur ? 'btn-on relative z-[1]' : ''}`} onClick={() => setMode(m)}>{LABEL[m]}</button>
        ))}
      </div>
      {cur === 'view' && html ? (
        <div className="cc-html panel-pre text-xs" dangerouslySetInnerHTML={{ __html: html }} />
      ) : cur === 'hex' || (cur === 'auto' && !printable) ? (
        <>
          <pre className="panel-pre whitespace-pre">{hexdump(bytes)}</pre>
          {cur === 'auto' && <p className="mt-1 text-[11px] text-muted">Contiene bytes no imprimibles, por eso se muestra como volcado hexadecimal.</p>}
        </>
      ) : cur === 'bytes' ? (
        <div className="max-h-[46vh] overflow-auto">
          <table className="tbl">
            <thead><tr>{['#', 'Hex', 'Dec', 'Binario', 'Car.'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {Array.from(bytes.subarray(0, 128), (b, i) => (
                <tr key={i}><td className="text-muted">{i}</td><td>{hx(b)}</td><td>{b}</td><td>{bin8(b)}</td><td>{chShow(b)}</td></tr>
              ))}
            </tbody>
          </table>
          {bytes.length > 128 && <p className="mt-1 text-[11px] text-muted">Se muestran los primeros 128 de {bytes.length} bytes.</p>}
        </div>
      ) : (
        <pre className="panel-pre whitespace-pre-wrap break-all">{bytes.length ? fromUtf8(bytes.subarray(0, 200000)) : '(vacío)'}</pre>
      )}
    </div>
  )
}
