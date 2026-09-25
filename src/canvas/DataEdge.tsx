import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import type { DataEdgeT } from '../engine/types'
import { isRevealed, useStore } from '../state/store'
import { fmtSize } from '../lib/bytes'
import { cssColor, typeColor } from '../components/ui'

/** Cable con una etiqueta que muestra el tipo y el tamaño del dato que viaja por él. */
export function DataEdge({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected }: EdgeProps<DataEdgeT>) {
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const res = useStore(s => s.results[source])
  const shown = useStore(s => isRevealed(s.step, source))
  const hot = useStore(s => s.step.hot.includes(id))
  const pulseKey = useStore(s => s.step.idx)
  const speed = useStore(s => s.step.speed)
  const openDetail = useStore(s => s.openDetail)

  const stroke = hot || selected ? 'rgb(var(--c-green))' : !shown ? 'rgb(var(--c-border))' : res && !res.ok ? 'rgb(var(--c-red))' : 'rgb(var(--c-wire))'
  const dash = !shown ? '4 5' : res && !res.ok ? '5 4' : undefined
  const c = cssColor(typeColor(res?.type))

  return (
    <>
      <BaseEdge id={id} path={path} interactionWidth={18} style={{ stroke, strokeDasharray: dash, strokeWidth: hot ? 2.2 : 1.6 }} />
      {hot && (
        <circle key={pulseKey} r={5.5} fill="rgb(var(--c-green))" stroke="rgb(var(--c-base))" strokeWidth={2}>
          <animateMotion dur={`${0.85 / speed}s`} path={path} fill="freeze" />
        </circle>
      )}
      {shown && res?.ok && (
        <EdgeLabelRenderer>
          <button
            className="nodrag nopan absolute flex overflow-hidden rounded border bg-base text-[10.5px] leading-none"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, pointerEvents: 'all', borderColor: `color-mix(in srgb, ${c} 40%, transparent)` }}
            title="Ver los datos que viajan por este cable"
            onClick={() => openDetail(target, 'in')}
          >
            <span className="px-1.5 py-1" style={{ color: c, background: `color-mix(in srgb, ${c} 12%, transparent)` }}>{res.type}</span>
            <span className="px-1.5 py-1 text-muted">{fmtSize(res.bytes!.length)}</span>
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
