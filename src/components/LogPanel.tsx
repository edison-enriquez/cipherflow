import { useEffect, useRef } from 'react'
import { useStore } from '../state/store'
import { topoOrder } from '../engine/graph'
import { opInfo } from '../engine/catalog'
import { fmtSize } from '../lib/bytes'
import { TypeTag } from './ui'

/** Registro de ejecución: qué entró y qué salió de cada bloque, en orden. */
export default function LogPanel() {
  const nodes = useStore(s => s.nodes)
  const edges = useStore(s => s.edges)
  const results = useStore(s => s.results)
  const step = useStore(s => s.step)
  const open = useStore(s => s.logOpen)
  const setOpen = useStore(s => s.setLogOpen)
  const openDetail = useStore(s => s.openDetail)
  const body = useRef<HTMLDivElement>(null)

  const ids = step.on ? step.done : topoOrder(nodes, edges)
  const rows = ids.map(id => nodes.find(n => n.id === id)).filter(Boolean) as typeof nodes
  useEffect(() => { if (step.on && body.current) body.current.scrollTop = body.current.scrollHeight }, [step.done.length, step.on])

  return (
    <div className="absolute bottom-3 left-3 z-10 flex max-h-[42%] w-[min(470px,calc(100%-9rem))] flex-col border border-border bg-base">
      <button className="flex items-center gap-2 px-2.5 py-2 text-[11px] font-bold uppercase tracking-widest" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="text-green">{open ? '▾' : '▸'}</span> Registro de ejecución
        <span className="ml-auto font-normal tracking-wider text-muted">{rows.length ? `${rows.length} paso${rows.length > 1 ? 's' : ''}` : ''}</span>
      </button>
      {open && (
        <div ref={body} className="overflow-y-auto border-t border-border">
          {rows.map((n, i) => {
            const r = results[n.id]
            const ins = edges.filter(e => e.target === n.id).sort((a, b) => String(a.targetHandle).localeCompare(String(b.targetHandle))).map(e => results[e.source]).filter(x => x?.ok)
            const last = step.on && i === rows.length - 1
            return (
              <button key={n.id} onClick={() => openDetail(n.id)} className={`grid w-full grid-cols-[1.6rem_1fr] gap-1.5 border-b border-border px-2.5 py-2 text-left text-xs hover:bg-surface ${last ? 'bg-green/10 shadow-[inset_2px_0_0_rgb(var(--c-green))]' : ''}`}>
                <span className="text-[11px] text-muted">{i + 1}</span>
                <span>
                  <span className="font-bold">{(n.data.op === '__output' && n.data.params?.label) || opInfo(n.data.op).name}</span>
                  <span className="mt-0.5 block text-[11px] text-muted">
                    {!r ? 'calculando…' : !r.ok ? <span className="text-red">{r.err}</span> : (
                      <>
                        {ins.length ? <>entra {ins.map((x, k) => <span key={k}><TypeTag type={x!.type} /> {fmtSize(x!.bytes!.length)} </span>)}</> : opInfo(n.data.op).inputs === 0 ? 'origen ' : ''}
                        {n.data.op === '__output' ? '→ resultado final' : <>→ sale <TypeTag type={r.type} /> {fmtSize(r.bytes!.length)}</>}
                      </>
                    )}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
