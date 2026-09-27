// Flujos guardados (como los «workflows» de n8n): cada lab, ejemplo o creación propia es un
// flujo con nombre que se guarda solo mientras se edita. Cambiar de flujo ya no borra nada.
import { useEffect, useRef, useState } from 'react'
import { useStore } from './store'
import { serializeGraph, type SavedGraph } from './runner'
import { newId, req, tx } from './db'
import { deleteExecutionsOfFlow, listExecutions } from './history'
import type { DataEdgeT, OpNodeT } from '../engine/types'
import { deleteThreadsOfFlow } from './chats'

export type FlowOrigin = 'lab' | 'example' | 'own' | 'import' | 'ai'
export const ORIGIN_LABEL: Record<FlowOrigin, string> = { lab: 'Laboratorio', example: 'Ejemplo', own: 'Propio', import: 'Importado', ai: 'IA' }

export interface Flow {
  id: string
  name: string
  origin: FlowOrigin
  /** Id del laboratorio o nombre del ejemplo del que salió (para reabrirlo o reiniciarlo). */
  originKey?: string
  favorite: boolean
  created: number
  updated: number
  graph: SavedGraph
}

const LAST_KEY = 'cipherflow.ultimo'
export const lastFlowId = () => { try { return localStorage.getItem(LAST_KEY) } catch { return null } }
export const setLastFlowId = (id: string) => { try { localStorage.setItem(LAST_KEY, id) } catch { /* sin almacenamiento */ } }

// ── Suscripción ─────────────────────────────────────────────────────────────────
const listeners = new Set<() => void>()
export const onFlowsChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } }
const changed = () => listeners.forEach(f => f())

// ── Consultas y cambios ─────────────────────────────────────────────────────────
export async function listFlows(): Promise<Flow[]> {
  try {
    const all = await tx(['flows'], 'readonly', t => req(t.objectStore('flows').getAll() as IDBRequest<Flow[]>))
    return all.sort((a, b) => b.updated - a.updated)
  } catch { return [] }
}

export const getFlow = (id: string) =>
  tx(['flows'], 'readonly', t => req(t.objectStore('flows').get(id) as IDBRequest<Flow | undefined>)).catch(() => undefined)

export async function putFlow(f: Flow, notify = true) {
  await tx(['flows'], 'readwrite', t => { t.objectStore('flows').put(f) })
  if (notify) changed()
}

export async function patchFlow(id: string, patch: Partial<Omit<Flow, 'id'>>) {
  const f = await getFlow(id)
  if (f) await putFlow({ ...f, ...patch })
}

/** «Flujo nuevo», «Flujo nuevo 2», … sin repetir nombres existentes. */
export async function uniqueName(base: string) {
  const names = new Set((await listFlows()).map(f => f.name))
  if (!names.has(base)) return base
  let i = 2
  while (names.has(`${base} ${i}`)) i++
  return `${base} ${i}`
}

export async function createFlow(p: { name: string; origin: FlowOrigin; originKey?: string; graph: SavedGraph }): Promise<Flow> {
  const now = Date.now()
  const f: Flow = { id: newId('f'), favorite: false, created: now, updated: now, ...p }
  await putFlow(f)
  return f
}

export async function duplicateFlow(id: string): Promise<Flow | null> {
  const f = await getFlow(id)
  if (!f) return null
  return createFlow({ name: await uniqueName(`${f.name} (copia)`), origin: 'own', graph: f.graph })
}

/** Borra el flujo y todas sus ejecuciones. */
export async function deleteFlow(id: string) {
  await tx(['flows'], 'readwrite', t => { t.objectStore('flows').delete(id) })
  await deleteExecutionsOfFlow(id)
  await deleteThreadsOfFlow(id)
  changed()
}

export const findByOrigin = async (origin: FlowOrigin, key: string) =>
  (await listFlows()).find(f => f.origin === origin && f.originKey === key)

export function downloadJSON(name: string, graph: SavedGraph) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(graph, null, 1)], { type: 'application/json' }))
  a.download = (name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'flujo') + '.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// ── React ───────────────────────────────────────────────────────────────────────
export function useFlows(): Flow[] | null {
  const [list, setList] = useState<Flow[] | null>(null)
  useEffect(() => {
    let alive = true
    const load = () => listFlows().then(l => { if (alive) setList(l) })
    load()
    const off = onFlowsChange(load)
    return () => { alive = false; off() }
  }, [])
  return list
}

/** Contenido que se guarda (sin selección ni medidas): si no cambia, no hay nada que guardar. */
const contentSig = (s: { nodes: OpNodeT[]; edges: DataEdgeT[]; flowName: string }) =>
  JSON.stringify([s.flowName, serializeGraph(s.nodes, s.edges)])

/** Autoguardado (como n8n): cada cambio del flujo abierto se guarda a los pocos cientos de ms.
 *  Un ejemplo o laboratorio abierto sin tocar es un borrador: se crea como flujo al primer cambio. */
export function useFlowAutosave(ready: boolean, onCreated: (id: string) => void) {
  const created = useRef(onCreated)
  created.current = onCreated
  useEffect(() => {
    if (!ready) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let base = contentSig(useStore.getState())
    type Snap = Pick<ReturnType<typeof useStore.getState>, 'session' | 'flowId' | 'flowOrigin' | 'flowName' | 'nodes' | 'edges'>
    const save = async (st: Snap) => {
      const graph = serializeGraph(st.nodes, st.edges)
      if (st.flowId) {
        const f = await getFlow(st.flowId)
        if (f) await putFlow({ ...f, name: st.flowName, graph, updated: Date.now() })
      } else if (isDraft(st)) {
        const o = st.flowOrigin!
        const f = await createFlow({ name: st.flowName, origin: o.origin as FlowOrigin, originKey: o.key, graph })
        if (useStore.getState().session !== st.session) return
        useStore.setState({ flowId: f.id })
        created.current(f.id)
      }
    }
    const unsub = useStore.subscribe((s, prev) => {
      if (s.session !== prev.session) {
        // Lo que quedaba por guardar del flujo anterior se guarda ya; abrir otro no es una edición
        if (timer) { clearTimeout(timer); timer = undefined; if (prev.mode !== 'executions') save(prev) }
        base = contentSig(s)
        if (s.saveState !== 'saved') useStore.setState({ saveState: 'saved' })
        return
      }
      if (s.mode === 'executions' || (!s.flowId && !isDraft(s))) return
      if (s.nodes === prev.nodes && s.edges === prev.edges && s.flowName === prev.flowName) return
      if (contentSig(s) === base) return
      if (s.saveState !== 'saving') useStore.setState({ saveState: 'saving' })
      clearTimeout(timer)
      timer = setTimeout(async () => {
        timer = undefined
        const st = useStore.getState()
        if (st.mode === 'executions') return
        const sig = contentSig(st)
        await save(st)
        if (useStore.getState().session !== st.session) return
        base = sig
        if (!timer) useStore.setState({ saveState: 'saved' })
      }, 600)
    })
    return () => { unsub(); clearTimeout(timer) }
  }, [ready])
}

/** Borrador: plantilla de ejemplo o laboratorio abierta que aún no es un flujo guardado. */
export const isDraft = (s: { flowId: string | null; flowOrigin: { origin: string } | null }) =>
  !s.flowId && (s.flowOrigin?.origin === 'lab' || s.flowOrigin?.origin === 'example')

const PRUNED_KEY = 'cipherflow.plantillas-limpias'

/** Una sola vez: borra los flujos de ejemplos y laboratorios que se crearon solo por abrirlos
 *  (idénticos a la plantilla, con el nombre original, sin favorito ni ejecuciones fijadas). */
export async function pruneUntouchedTemplates(template: (origin: FlowOrigin, key: string) => { name: string; graph: SavedGraph } | null) {
  try { if (localStorage.getItem(PRUNED_KEY)) return } catch { return }
  const pinned = new Set((await listExecutions()).filter(m => m.pinned && m.flowId).map(m => m.flowId))
  for (const f of await listFlows()) {
    if ((f.origin !== 'lab' && f.origin !== 'example') || !f.originKey || f.favorite || pinned.has(f.id)) continue
    const t = template(f.origin, f.originKey)
    if (t && t.name === f.name && sameGraph(t.graph, f.graph)) await deleteFlow(f.id)
  }
  try { localStorage.setItem(PRUNED_KEY, '1') } catch { /* sin almacenamiento */ }
}

/** Compara dos grafos sin tener en cuenta los ids de los bloques. */
function sameGraph(a: SavedGraph, b: SavedGraph) {
  const canon = (g: SavedGraph) => {
    const idx = new Map(g.nodes.map((n, i) => [n.id, i]))
    return JSON.stringify([
      g.nodes.map(n => [n.op, n.x, n.y, n.args ?? null, n.params ?? null]),
      g.edges.map(e => [idx.get(e.from), idx.get(e.to), e.port]).sort(),
    ])
  }
  return canon(a) === canon(b)
}
