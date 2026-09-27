import { useMemo, useState } from 'react'
import { Copy, Download, FolderOpen, Pencil, Plus, Search, Sparkles, Star, Trash2, Upload } from 'lucide-react'
import { useAgentStore } from '../agent/config'
import { ORIGIN_LABEL, deleteFlow, downloadJSON, duplicateFlow, patchFlow, useFlows, type Flow } from '../state/flows'
import { useExecutions } from '../state/recorder'
import type { ExecMeta } from '../state/history'
import { go } from '../router'
import { EXAMPLE_GROUPS } from '../examples'
import { useStore } from '../state/store'

export function when(at: number) {
  const s = (Date.now() - at) / 1000
  if (s < 60) return 'hace un momento'
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`
  const d = new Date(at), now = new Date()
  const hm = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return 'hoy ' + hm
  if (new Date(now.getTime() - 864e5).toDateString() === d.toDateString()) return 'ayer ' + hm
  return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

const ORIGIN_COLOR: Record<string, string> = { lab: 'text-green border-green/40', example: 'text-blue border-blue/40', own: 'text-muted border-border', import: 'text-yellow border-yellow/40', ai: 'text-purple border-purple/40' }

const EXAMPLE_COUNT = EXAMPLE_GROUPS.reduce((s, g) => s + Object.keys(g.examples).length, 0)

/** Pestañas de la página de inicio: flujos propios, galería de ejemplos y todas las ejecuciones. */
export function HomeTabs({ active }: { active: 'flows' | 'examples' }) {
  const flows = useFlows()
  const execs = useExecutions()
  const tab = (on: boolean) => on ? '-mb-px border-b-2 border-green px-3 py-2 font-bold text-green' : 'px-3 py-2 text-muted hover:text-green'
  return (
    <div className="scroll-row mb-3 flex overflow-x-auto border-b border-border text-[11px] uppercase tracking-wider" role="tablist">
      <button role="tab" aria-selected={active === 'flows'} className={`shrink-0 ${tab(active === 'flows')}`} onClick={() => go({ view: 'home' })}>Flujos <span className="font-normal opacity-80">{flows?.length ?? ''}</span></button>
      <button role="tab" aria-selected={active === 'examples'} className={`shrink-0 ${tab(active === 'examples')}`} onClick={() => go({ view: 'examples' })}>Ejemplos <span className="font-normal opacity-80">{EXAMPLE_COUNT}</span></button>
      <button role="tab" aria-selected="false" className={`shrink-0 ${tab(false)}`} onClick={() => go({ view: 'executions' })}>Todas las ejecuciones <span className="font-normal opacity-80">{execs.length || ''}</span></button>
    </div>
  )
}

/** «Mis flujos»: la página de inicio, como el listado de workflows de n8n. */
export default function FlowsPage({ onNew, onImport }: { onNew: () => void; onImport: () => void }) {
  const flows = useFlows()
  const execs = useExecutions()
  const current = useStore(s => s.flowId)
  const [q, setQ] = useState('')
  const [order, setOrder] = useState<'recent' | 'name'>('recent')

  const stats = useMemo(() => {
    const m = new Map<string, { n: number; last?: ExecMeta }>()
    for (const e of execs) if (e.flowId) {
      const s = m.get(e.flowId) ?? { n: 0 }
      s.n++
      if (!s.last) s.last = e   // la lista viene de la más reciente a la más antigua
      m.set(e.flowId, s)
    }
    return m
  }, [execs])

  const shown = useMemo(() => {
    if (!flows) return []
    const t = q.trim().toLowerCase()
    const l = flows.filter(f => !t || f.name.toLowerCase().includes(t) || ORIGIN_LABEL[f.origin].toLowerCase().includes(t))
    const byOrder = order === 'name' ? (a: Flow, b: Flow) => a.name.localeCompare(b.name, 'es') : (a: Flow, b: Flow) => b.updated - a.updated
    return l.sort((a, b) => Number(b.favorite) - Number(a.favorite) || byOrder(a, b))
  }, [flows, q, order])

  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h1 className="text-xl font-bold">Mis flujos</h1>
            <p className="mt-1 text-xs text-muted">Cada laboratorio, ejemplo o flujo propio se guarda solo mientras lo editas, en este navegador.</p>
          </div>
          <button className="btn" onClick={onImport}><Upload size={13} /> Importar</button>
          <button className="btn" onClick={() => useAgentStore.getState().setAssistantOpen(true)}><Sparkles size={13} /> Nuevo flujo con IA</button>
          <button className="btn btn-primary" onClick={onNew}><Plus size={13} /> Nuevo flujo</button>
        </div>
        <HomeTabs active="flows" />
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="field-input pl-8" type="search" placeholder="Buscar flujos…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar flujos" />
          </div>
          <select className="btn bg-base" value={order} onChange={e => setOrder(e.target.value as 'recent' | 'name')} aria-label="Ordenar">
            <option value="recent">Modificados recientemente</option>
            <option value="name">Por nombre</option>
          </select>
        </div>

        {flows === null ? <p className="p-6 text-center text-xs text-muted">Cargando…</p>
          : !flows.length ? (
            <div className="border border-dashed border-border p-8 text-center text-[13px] leading-relaxed text-muted">
              Todavía no tienes flujos. Crea uno nuevo, abre un laboratorio o <button className="text-green underline-offset-2 hover:underline" onClick={() => go({ view: 'examples' })}>explora los ejemplos</button>.
            </div>
          ) : !shown.length ? <p className="p-6 text-center text-xs text-muted">Ningún flujo coincide con la búsqueda.</p>
          : (
            <ul className="divide-y divide-border border border-border" aria-label="Flujos">
              {shown.map(f => <FlowRow key={f.id} f={f} stats={stats.get(f.id)} current={f.id === current} />)}
            </ul>
          )}
      </div>
    </div>
  )
}

function FlowRow({ f, stats, current }: { f: Flow; stats?: { n: number; last?: ExecMeta }; current: boolean }) {
  const open = () => go({ view: 'flow', id: f.id, tab: 'editor' })
  const rename = () => { const n = prompt('Nuevo nombre del flujo:', f.name); if (n?.trim()) patchFlow(f.id, { name: n.trim() }).then(() => { if (current) useStore.getState().setFlowName(n.trim()) }) }
  const dup = async () => { const c = await duplicateFlow(f.id); if (c) go({ view: 'flow', id: c.id, tab: 'editor' }) }
  const del = async () => {
    if (!confirm(`¿Borrar «${f.name}» y sus ${stats?.n ?? 0} ejecuciones? No se puede deshacer.`)) return
    await deleteFlow(f.id)
    if (current) useStore.setState({ flowId: null })
  }
  return (
    <li className={`group flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 hover:bg-surface sm:flex-nowrap ${current ? 'bg-green/5' : ''}`}>
      <button className={`shrink-0 ${f.favorite ? 'text-yellow' : 'text-muted/50 hover:text-yellow'}`} onClick={() => patchFlow(f.id, { favorite: !f.favorite })} aria-label={f.favorite ? 'Quitar de favoritos' : 'Marcar como favorito'} title="Favorito">
        <Star size={14} fill={f.favorite ? 'currentColor' : 'none'} />
      </button>
      <button className="min-w-0 flex-1 text-left" onClick={open}>
        <span className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-bold group-hover:text-green">{f.name}</span>
          <span className={`shrink-0 border px-1.5 text-[9.5px] uppercase tracking-wider ${ORIGIN_COLOR[f.origin]}`}>{ORIGIN_LABEL[f.origin]}</span>
          {current && <span className="shrink-0 text-[10px] uppercase tracking-wider text-green">abierto</span>}
        </span>
        <span className="mt-0.5 block text-[11px] text-muted">
          Modificado {when(f.updated)} · {f.graph.nodes.length} bloques · creado {when(f.created)}
        </span>
      </button>
      <button className="hidden shrink-0 items-center gap-1.5 text-[11px] text-muted hover:text-green sm:flex" onClick={() => go({ view: 'flow', id: f.id, tab: 'executions' })} title="Ver sus ejecuciones">
        {stats?.last && <span className={`h-2 w-2 rounded-full ${stats.last.ok ? 'bg-[rgb(var(--c-ok))]' : 'bg-red'}`} />}
        {stats?.n ?? 0} {stats?.n === 1 ? 'ejecución' : 'ejecuciones'}
      </button>
      {/* En móvil, las acciones van en su propia fila bajo el nombre */}
      <span className="ml-[26px] flex w-full shrink-0 gap-1 sm:ml-0 sm:w-auto sm:opacity-60 sm:group-hover:opacity-100">
        <button className="btn btn-icon hidden sm:inline-flex" onClick={open} aria-label="Abrir" title="Abrir"><FolderOpen size={13} /></button>
        <button className="btn btn-icon" onClick={rename} aria-label="Renombrar" title="Renombrar"><Pencil size={13} /></button>
        <button className="btn btn-icon" onClick={dup} aria-label="Duplicar" title="Duplicar"><Copy size={13} /></button>
        <button className="btn btn-icon" onClick={() => downloadJSON(f.name, f.graph)} aria-label="Exportar JSON" title="Exportar JSON"><Download size={13} /></button>
        <button className="btn btn-icon hover:!border-red/50 hover:!text-red" onClick={del} aria-label="Borrar flujo" title="Borrar flujo"><Trash2 size={13} /></button>
      </span>
    </li>
  )
}
