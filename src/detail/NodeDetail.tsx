import { useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Copy, RefreshCw, X } from 'lucide-react'
import { useStore, type DetailTab } from '../state/store'
import { catColor, opInfo } from '../engine/catalog'
import { dishString, opConfig, presentHTML } from '../engine/cyberchef'
import { inPort, invalidate, topoOrder } from '../engine/graph'
import { fmtSize, fromUtf8, isPrintable, sanitizeHTML, toHex } from '../lib/bytes'
import { Square, TypeTag } from '../components/ui'
import DataView from './DataView'
import Params from './Params'
import Process from './Process'
import type { ExplainCtx } from '../explainers'

const TABS: [DetailTab, string][] = [['in', 'Entrada'], ['par', 'Parámetros'], ['out', 'Salida'], ['proc', 'Proceso']]

function Col({ tab, cur, title, children, className = '' }: { tab: DetailTab; cur: DetailTab; title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 p-4 md:block md:max-h-[62vh] md:overflow-auto ${tab === cur ? 'block' : 'hidden'} ${className}`}>
      <h3 className="label mb-2.5 flex items-center gap-2">{title}</h3>
      {children}
    </section>
  )
}

/** Vista de detalle al estilo de n8n: lo que entra, los parámetros, lo que sale y el proceso interno. */
export default function NodeDetail() {
  const detail = useStore(s => s.detail)
  const node = useStore(s => s.nodes.find(n => n.id === s.detail?.id))
  const nodes = useStore(s => s.nodes)
  const edges = useStore(s => s.edges)
  const results = useStore(s => s.results)
  const close = useStore(s => s.closeDetail)
  const open = useStore(s => s.openDetail)
  const setTab = useStore(s => s.setDetailTab)
  const showToast = useStore(s => s.showToast)
  const updateData = useStore(s => s.updateData)
  const [html, setHtml] = useState<string | null>(null)
  const [ctx, setCtx] = useState<ExplainCtx | null>(null)

  const res = node ? results[node.id] : undefined
  const info = node ? opInfo(node.data.op) : null
  const inputs = node && info ? Array.from({ length: info.inputs }, (_, p) => {
    const e = edges.find(e => e.target === node.id && inPort(e) === p)
    return e ? { src: nodes.find(n => n.id === e.source), r: results[e.source] } : null
  }) : []
  const in0 = inputs[0]?.r

  useEffect(() => {
    let alive = true
    setHtml(null); setCtx(null)
    if (!node || !res?.ok) return
    ;(async () => {
      const h = await presentHTML(res.op, res.dish)
      const cfg = opConfig(node.data.op)
      const args = node.data.args ?? []
      const c: ExplainCtx = {
        op: node.data.op, args,
        arg: name => { const i = cfg?.args.findIndex(a => a.name === name) ?? -1; return i >= 0 ? args[i] : undefined },
        inBytes: in0?.ok ? in0.bytes! : new Uint8Array(0),
        inStr: in0?.ok ? await dishString(in0.dish) : '',
        outStr: await dishString(res.dish),
        outBytes: res.bytes!,
      }
      if (alive) { setHtml(h ? sanitizeHTML(h) : null); setCtx(c) }
    })()
    return () => { alive = false }
  }, [node?.id, node?.data, res, in0])

  useEffect(() => {
    if (!detail) return
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [detail, close])

  if (!detail || !node || !info) return null
  const tab = detail.tab
  const order = topoOrder(nodes, edges)
  const pos = order.indexOf(node.id)
  const cfg = opConfig(node.data.op)
  const title = (node.data.op === '__output' && node.data.params?.label) || info.name

  const copy = async () => {
    if (!res?.ok) return
    const t = isPrintable(res.bytes!) ? fromUtf8(res.bytes!) : toHex(res.bytes!)
    try { await navigator.clipboard.writeText(t) } catch { /* sin permiso */ }
    showToast('Salida copiada')
  }

  return (
    <div className="fixed inset-0 z-40 bg-base/70 backdrop-blur-[2px] md:p-4" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="nd-title" className="flex h-full animate-fade-in flex-col overflow-hidden border-border bg-surface md:rounded-lg md:border">
        <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <Square color={catColor(info.cat)} size={10} />
          <div className="min-w-0 flex-1">
            <h2 id="nd-title" className="truncate text-[17px] font-bold">{title}</h2>
            <p className="truncate text-[10.5px] uppercase tracking-wider text-muted">{info.cat}{cfg && `, entra ${cfg.inputType} y sale ${cfg.outputType}`}</p>
          </div>
          <button className="btn btn-icon" disabled={pos <= 0} onClick={() => open(order[pos - 1])} aria-label="Bloque anterior"><ChevronLeft size={14} /></button>
          <button className="btn btn-icon" disabled={pos >= order.length - 1} onClick={() => open(order[pos + 1])} aria-label="Bloque siguiente"><ChevronRight size={14} /></button>
          <button className="btn" onClick={close}><X size={13} /> Cerrar</button>
        </header>
        <nav className="flex border-b border-border md:hidden">
          {TABS.map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 border-b-2 py-2.5 text-[11px] uppercase tracking-wider ${t === tab ? 'border-green font-bold text-green' : 'border-transparent text-muted'}`}>{l}</button>
          ))}
        </nav>
        <div className="flex-1 overflow-y-auto">
          <div className="border-border md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)] md:border-b md:divide-x md:divide-border">
            <Col tab="in" cur={tab} title={<><span className="text-green">→</span> Entrada</>}>
              {info.inputs === 0 && <p className="text-xs text-muted">Este bloque es un origen de datos: no recibe nada. Lo que escribas en Parámetros es lo que sale.</p>}
              {inputs.map((x, p) => (
                <div key={p} className={p ? 'mt-4' : ''}>
                  {info.inputs > 1 && <h4 className="mb-1 text-xs font-bold">Entrada {p + 1}</h4>}
                  {!x ? <p className="text-xs text-muted">{cfg ? 'Sin conexión: la operación recibe un texto vacío.' : 'Sin conexión.'}</p>
                    : !x.r?.ok ? <p className="text-xs text-muted">Viene de «{x.src ? opInfo(x.src.data.op).name : '?'}», que {x.r ? 'tiene un error' : 'aún se está calculando'}.</p>
                    : (
                      <>
                        <p className="mb-2 text-[11.5px] text-muted">Viene de «{(x.src?.data.op === '__output' && x.src.data.params?.label) || opInfo(x.src!.data.op).name}» como <TypeTag type={x.r.type} /> {fmtSize(x.r.bytes!.length)}</p>
                        {cfg && cfg.inputType.toLowerCase() !== x.r.type!.toLowerCase() && (
                          <p className="my-2 rounded border border-yellow/35 bg-yellow/10 px-2.5 py-1.5 text-xs">CyberChef convierte el dato de <b>{x.r.type}</b> a <b>{cfg.inputType}</b> antes de ejecutar la operación, porque es el tipo que esta operación espera.</p>
                        )}
                        <DataView bytes={x.r.bytes!} />
                      </>
                    )}
                </div>
              ))}
            </Col>
            <Col tab="par" cur={tab} title="Parámetros"><Params key={node.id} node={node} /></Col>
            <Col tab="out" cur={tab} title={<>Salida <span className="text-green">→</span></>}>
              {!res ? <p className="text-xs text-muted">Calculando…</p>
                : !res.ok ? <pre className="whitespace-pre-wrap text-xs text-red">{res.err}</pre>
                : (
                  <>
                    <p className="mb-2 text-[11.5px] text-muted">Sale como <TypeTag type={res.type} /> {fmtSize(res.bytes!.length)}{res.ms !== undefined && node.data.op !== '__output' && `, calculado en ${res.ms < 1 ? 'menos de 1' : res.ms.toFixed(1)} ms`}</p>
                    <DataView key={node.id + (html ? 'h' : '')} bytes={res.bytes!} html={html} />
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <button className="btn" onClick={copy}><Copy size={12} /> Copiar salida</button>
                      {cfg && <button className="btn" onClick={() => { invalidate(node.id); updateData(node.id, { args: [...(node.data.args ?? [])] }) }}><RefreshCw size={12} /> Volver a ejecutar</button>}
                    </div>
                  </>
                )}
            </Col>
          </div>
          <div className={`p-4 md:block ${tab === 'proc' ? 'block' : 'hidden'}`}>
            <Process op={node.data.op} res={res} input={in0 ?? undefined} ctx={ctx} />
          </div>
        </div>
      </div>
    </div>
  )
}
