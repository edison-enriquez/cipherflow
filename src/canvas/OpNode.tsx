import { memo, useMemo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Maximize2, X } from 'lucide-react'
import { catColor, opInfo } from '../engine/catalog'
import type { OpNodeT } from '../engine/types'
import { isRevealed, useStore } from '../state/store'
import { fmtSize, fromUtf8, isPrintable, toHex } from '../lib/bytes'
import { Square, TypeTag } from '../components/ui'

export const NODE_W = 216
const PORT_Y = 50
const GAP = 28

function preview(b: Uint8Array, lim: number) {
  const cut = b.length > lim * 2 ? b.subarray(0, lim * 2) : b
  let s = isPrintable(cut) ? fromUtf8(cut) : toHex(cut, ' ')
  if (s.length > lim) s = s.slice(0, lim) + '…'
  return b.length ? s : '(vacío)'
}

function OpNodeImpl({ id, data, selected }: NodeProps<OpNodeT>) {
  const info = opInfo(data.op)
  const res = useStore(s => s.results[id])
  const shown = useStore(s => isRevealed(s.step, id))
  const active = useStore(s => s.step.active === id)
  const linked = useStore(s => s.edges.filter(e => e.target === id).map(e => e.targetHandle ?? 'in0').join(','))
  const openDetail = useStore(s => s.openDetail)
  const removeNode = useStore(s => s.removeNode)
  const sink = data.op === '__output'
  const title = (sink && data.params?.label) || info.name
  const sub = data.op === '__input' ? (data.params?.file ? 'Archivo: ' + data.params.fileName : 'Como ' + data.params?.fmt) : info.cat
  const text = useMemo(() => (res?.ok && res.bytes ? preview(res.bytes, sink ? 1500 : 150) : ''), [res, sink])

  const state = !shown ? 'pending' : !res ? 'wait' : res.ok ? 'done' : 'err'
  const border = active ? 'border-green shadow-[0_0_0_5px_rgb(var(--c-green)/0.2),0_0_28px_rgb(var(--c-green)/0.3)]'
    : selected ? 'border-green shadow-[0_0_0_3px_rgb(var(--c-green)/0.18)]'
    : state === 'err' ? 'border-red/50' : 'border-border hover:border-green/40'

  return (
    <div
      className={`relative rounded-lg border bg-surface transition-[border-color,box-shadow,opacity] ${border} ${state === 'pending' ? 'border-dashed opacity-45' : ''}`}
      style={{ width: NODE_W, minHeight: info.inputs > 1 ? PORT_Y + GAP * info.inputs : undefined }}
    >
      <div className="flex h-8 items-center gap-2 border-b border-border pl-3 pr-0.5">
        <Square color={catColor(info.cat)} />
        <span className="flex-1 truncate text-[12.5px] font-bold">{title}</span>
        <button className="nodrag grid h-7 w-6 place-items-center text-muted hover:text-green" title="Abrir detalle" aria-label="Abrir detalle" onClick={() => openDetail(id)}>
          <Maximize2 size={12} />
        </button>
        <button className="nodrag grid h-7 w-6 place-items-center text-muted hover:text-red" title="Eliminar" aria-label="Eliminar bloque" onClick={() => removeNode(id)}>
          <X size={13} />
        </button>
      </div>
      <div className="px-3 pb-2.5 pt-2">
        <div className="mb-1 truncate text-[10px] uppercase tracking-wider text-muted">{sub}</div>
        <div className={`whitespace-pre-wrap break-all text-[11px] leading-snug ${sink ? 'max-h-36' : 'max-h-12'} overflow-hidden ${state === 'err' ? 'text-red' : ''} ${state === 'pending' ? 'invisible' : ''}`}>
          {!res ? '…' : res.ok ? text : res.err}
        </div>
        {res?.ok && state !== 'pending' && (
          <div className="mt-1.5 flex items-center gap-1.5 border-t border-border pt-1.5 text-[10.5px] text-muted">
            <TypeTag type={res.type} />
            <span className="text-text">{fmtSize(res.bytes!.length)}</span>
            {!sink && res.ms !== undefined && <span>{res.ms < 1 ? '<1' : res.ms.toFixed(0)} ms</span>}
          </div>
        )}
      </div>
      {(state === 'done' || state === 'err') && (
        <span className={`absolute -right-2 -top-2 grid h-[18px] w-[18px] place-items-center rounded text-[11px] font-bold text-[rgb(var(--c-base))] ${state === 'done' ? 'bg-ok' : 'bg-red'}`}>
          {state === 'done' ? '✓' : '!'}
        </span>
      )}
      {Array.from({ length: info.inputs }, (_, i) => (
        <Handle key={i} type="target" position={Position.Left} id={`in${i}`} className={linked.split(',').includes(`in${i}`) ? 'on' : ''} style={{ top: PORT_Y + i * GAP }} title={info.inputs > 1 ? `Entrada ${i + 1}` : 'Entrada'} />
      ))}
      {info.inputs > 1 && Array.from({ length: info.inputs }, (_, i) => (
        <span key={'l' + i} className="pointer-events-none absolute left-2 text-[9.5px] text-muted" style={{ top: PORT_Y + i * GAP - 7 }}>{i + 1}</span>
      ))}
      {!sink && <Handle type="source" position={Position.Right} id="out" style={{ top: PORT_Y }} title="Salida" />}
    </div>
  )
}

export const OpNode = memo(OpNodeImpl)
