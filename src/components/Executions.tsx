import { useEffect, useMemo, useState } from 'react'
import { Download, History, Pin, PinOff, Search, SquarePen, Trash2, X } from 'lucide-react'
import { useStore } from '../state/store'
import { useExecutions } from '../state/recorder'
import {
  autoEnabled, clearExecutions, deleteExecution, exportExecution, getExecution, hydrateResults,
  onHistoryChange, recordExecution, setAutoEnabled, updateMeta, MAX_EXECS, type ExecMeta,
} from '../state/history'
import { graphFromSaved } from '../io'
import { createFlow, getFlow, putFlow, useFlows } from '../state/flows'
import { go } from '../router'

const hhmm = (d: Date) => d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
function when(at: number) {
  const d = new Date(at), now = new Date()
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = (day(now) - day(d)) / 864e5
  if (diff === 0) return 'hoy ' + hhmm(d)
  if (diff === 1) return 'ayer ' + hhmm(d)
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short' }) + ' ' + hhmm(d)
}
const fmtMs = (ms: number) => ms < 1 ? '<1 ms' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`

/** Abre una ejecución guardada en el lienzo, en solo lectura. */
export async function openExecution(id: string, onOpened?: () => void) {
  const e = await getExecution(id)
  if (!e) return false
  const { nodes, edges } = graphFromSaved(e.data.graph)
  const results = await hydrateResults(e.data)
  if (useStore.getState().mode !== 'executions') return false
  useStore.getState().viewExecution(id, nodes, edges, results)
  onOpened?.()
  return true
}

/** Lista de ejecuciones (columna izquierda en el modo «Ejecuciones»). */
export function ExecutionsPanel({ open, onClose, onOpened }: { open: boolean; onClose: () => void; onOpened: () => void }) {
  const all = useExecutions()
  const scope = useStore(s => s.execScope)
  const list = useMemo(() => scope === null ? all : all.filter(m => m.flowId === scope), [all, scope])
  const flows = useFlows()
  const flowName = (m: ExecMeta) => flows?.find(f => f.id === m.flowId)?.name ?? m.name
  const viewing = useStore(s => s.viewing)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | 'ok' | 'err'>('all')
  const [auto, setAuto] = useState(autoEnabled)
  useEffect(() => onHistoryChange(() => setAuto(autoEnabled())), [])

  const shown = useMemo(() => list.filter(m =>
    (status === 'all' || (status === 'ok') === m.ok) && (!q.trim() || flowName(m).toLowerCase().includes(q.trim().toLowerCase()))), [list, q, status, flows]) // eslint-disable-line react-hooks/exhaustive-deps

  // Al entrar (o al cambiar de flujo), abre la más reciente para que el lienzo no quede vacío
  useEffect(() => {
    if (!viewing && list.length) openExecution(list[0].id, onOpened)
  }, [scope, list.length > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  const pinned = list.filter(m => m.pinned).length
  return (
    <aside className={`absolute inset-y-0 left-0 z-30 flex w-[min(88vw,320px)] flex-col border-r border-border bg-base transition-transform md:static md:z-auto md:w-[300px] md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center gap-2 px-3 pb-1 pt-3">
        <History size={14} className="text-green" />
        <h2 className="label flex-1 text-text">{scope === null ? 'Todas las ejecuciones' : 'Ejecuciones del flujo'}</h2>
        <span className="text-[11px] text-muted">{list.length}</span>
        <button className="btn btn-icon md:hidden" onClick={onClose} aria-label="Cerrar la lista"><X size={13} /></button>
      </div>
      <div className="space-y-1.5 px-3 pb-2 pt-1.5">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="field-input pl-8" type="search" placeholder={scope === null ? 'Buscar por flujo…' : 'Buscar por nombre…'} value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar ejecución" />
        </div>
        <div className="flex">
          {([['all', 'Todas'], ['ok', 'Correctas'], ['err', 'Con errores']] as const).map(([k, l], i) => (
            <button key={k} className={`btn flex-1 px-1 ${i ? '-ml-px' : ''} ${status === k ? 'btn-on' : ''}`} onClick={() => setStatus(k)}>{l}</button>
          ))}
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto border-t border-border" aria-label="Ejecuciones guardadas">
        {!list.length ? (
          <p className="p-4 text-xs leading-relaxed text-muted">
            Aún no hay ejecuciones. Se registran solas cuando un flujo termina de ejecutarse y lleva un momento sin cambios,
            o con <b className="text-text">Guardar ejecución</b> en el editor.
          </p>
        ) : !shown.length ? (
          <p className="p-4 text-xs text-muted">Ninguna ejecución coincide con el filtro.</p>
        ) : shown.map(m => <Row key={m.id} m={m} title={scope === null ? flowName(m) : m.name} active={m.id === viewing} onOpen={() => { openExecution(m.id, onOpened); onClose() }} />)}
      </nav>
      <div className="space-y-2 border-t border-border p-3 text-[11.5px]">
        <label className="flex items-center gap-2 text-muted">
          <input type="checkbox" className="accent-[rgb(var(--c-green))]" checked={auto} onChange={e => setAutoEnabled(e.target.checked)} />
          Registrar automáticamente
        </label>
        <p className="text-[10.5px] leading-snug text-muted">Se guardan en este navegador. De cada flujo se conservan las {MAX_EXECS} más recientes; las fijadas no se borran nunca.</p>
        <button
          className="btn w-full hover:!border-red/50 hover:!text-red"
          disabled={list.length === pinned}
          onClick={() => { if (confirm(`¿Borrar ${list.length - pinned} ejecuciones${scope === null ? ' de todos los flujos' : ' de este flujo'}? Las fijadas se conservan.`)) clearExecutions(true, scope) }}
        ><Trash2 size={12} /> Borrar historial</button>
      </div>
    </aside>
  )
}

function Row({ m, title, active, onOpen }: { m: ExecMeta; title: string; active: boolean; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      aria-current={active ? 'true' : undefined}
      className={`grid w-full grid-cols-[0.6rem_1fr_auto] items-start gap-x-2 border-b border-border px-3 py-2.5 text-left hover:bg-surface ${active ? 'bg-green/10 shadow-[inset_2px_0_0_rgb(var(--c-green))]' : ''}`}
    >
      <span className={`mt-1 h-2 w-2 rounded-full ${m.ok ? 'bg-[rgb(var(--c-ok))]' : 'bg-red'}`} title={m.ok ? 'Correcta' : `${m.errors} con error`} />
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-bold">{title}</span>
        <span className="mt-0.5 block text-[11px] text-muted">
          {m.ok ? 'Correcta' : <span className="text-red">{m.errors} {m.errors === 1 ? 'error' : 'errores'}</span>} · {m.blocks} bloques · {fmtMs(m.ms)}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1 text-[10.5px] text-muted">
        <span className="whitespace-nowrap">{when(m.at)}</span>
        <span className="flex items-center gap-1">
          {m.labPassed && <span className="uppercase tracking-wider text-green" title="Cumplía el criterio de éxito del laboratorio">reto ✓</span>}
          {m.mode === 'manual' && <span className="uppercase tracking-wider">guardada</span>}
          {m.pinned && <Pin size={11} className="text-green" aria-label="Fijada" />}
        </span>
      </span>
    </button>
  )
}

/** Barra sobre el lienzo con la ejecución abierta y sus acciones. */
export function ExecutionBar({ onRestore }: { onRestore: () => void }) {
  const viewing = useStore(s => s.viewing)
  const list = useExecutions()
  const showToast = useStore(s => s.showToast)
  const m = list.find(x => x.id === viewing)
  if (!viewing || !m) return null

  const restore = async () => {
    const st = useStore.getState()
    const e = await getExecution(m.id)
    if (!e) return
    // El flujo de destino es el de la ejecución; si ya no existe (o es anterior a los flujos), se crea uno
    let target = m.flowId ? await getFlow(m.flowId) : undefined
    if (!target) target = await createFlow({ name: m.name, origin: 'own', graph: e.data.graph })
    // Antes de reemplazar su lienzo, el estado actual de ese flujo queda a salvo en el historial
    if (st.stash && st.flowId === target.id && st.stash.nodes.length && st.stash.nodes.every(n => st.stash!.results[n.id])) {
      await recordExecution(target.id, st.stash.nodes, st.stash.edges, st.stash.results, st.flowName, 'auto').catch(() => null)
    }
    await putFlow({ ...target, graph: e.data.graph, updated: Date.now() })
    const { nodes, edges } = graphFromSaved(e.data.graph)
    st.exitExecutions(false)
    st.openFlow(nodes, edges, { id: target.id, name: target.name, origin: { origin: target.origin, key: target.originKey } })
    go({ view: 'flow', id: target.id, tab: 'editor' })
    onRestore()
    showToast('Ejecución restaurada en el editor')
  }
  const download = async () => {
    const e = await getExecution(m.id)
    if (!e) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([exportExecution(e.data)], { type: 'application/json' }))
    a.download = `${m.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'flujo'}-${new Date(m.at).toISOString().slice(0, 16).replace(/[:T]/g, '')}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const remove = async () => {
    if (!confirm('¿Borrar esta ejecución?')) return
    await deleteExecution(m.id)
    useStore.setState({ viewing: null, nodes: [], edges: [], results: {}, detail: null })
  }

  return (
    <div className="absolute inset-x-3 top-3 z-10 mx-auto flex w-fit max-w-full flex-wrap items-center justify-center gap-1.5 border border-border bg-base p-1.5">
      <span className="px-1.5 text-[11px] text-muted">
        <b className="text-text">{m.name}</b> · {when(m.at)} · <span className="uppercase tracking-wider">solo lectura</span>
      </span>
      <button className="btn btn-primary" onClick={restore} title="Reemplaza el lienzo del editor por este flujo"><SquarePen size={12} /> Abrir en el editor</button>
      <button className="btn" onClick={() => updateMeta(m.id, { pinned: !m.pinned })} title={m.pinned ? 'Permitir que se borre sola' : 'Conservarla siempre'}>
        {m.pinned ? <><PinOff size={12} /> Desfijar</> : <><Pin size={12} /> Fijar</>}
      </button>
      <button className="btn btn-icon" onClick={download} aria-label="Exportar el flujo (JSON)" title="Exportar el flujo (JSON importable)"><Download size={13} /></button>
      <button className="btn btn-icon hover:!border-red/50 hover:!text-red" onClick={remove} aria-label="Borrar esta ejecución" title="Borrar esta ejecución"><Trash2 size={13} /></button>
    </div>
  )
}
