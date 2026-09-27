// Historial de ejecuciones (al estilo de la pestaña «Executions» de n8n), guardado en IndexedDB.
// Cada ejecución conserva una foto del flujo y lo que salió de cada bloque, así que sobrevive
// a recargas y a cambios de diseño. «meta» guarda lo ligero (la lista); «data», el grafo y los bytes.
import { bytesDish, loadOpClass } from '../engine/cyberchef'
import { isCustom } from '../engine/catalog'
import type { DataEdgeT, OpNodeT, Result } from '../engine/types'
import { serializeGraph, type SavedGraph } from './runner'
import { newId, req, tx } from './db'

export const MAX_EXECS = 50              // ejecuciones no fijadas que se conservan por flujo
export const MAX_NODE_BYTES = 1 << 20    // salida guardada por bloque (1 MB)
const DEDUPE_WINDOW = 10                 // no se repite un flujo idéntico a uno de las últimas N
const AUTO_KEY = 'cipherflow.historial'  // 'off' desactiva el registro automático

export interface ExecMeta {
  id: string
  /** Flujo al que pertenece (las ejecuciones anteriores a los flujos no lo tienen). */
  flowId?: string
  at: number
  name: string
  mode: 'auto' | 'manual'
  pinned: boolean
  ok: boolean
  errors: number
  blocks: number
  ms: number
  sig: string
  /** El flujo cumplía el criterio de éxito de su laboratorio. */
  labPassed?: boolean
}

export interface ExecNodeData {
  ok: boolean
  err?: string
  type?: string
  bytes?: Uint8Array
  size?: number          // tamaño real si se recortó
  ms?: number
}

export interface ExecData {
  id: string
  graph: SavedGraph
  results: Record<string, ExecNodeData>
}

// ── Suscripción (para que la interfaz se entere de altas y bajas) ────────────────
const listeners = new Set<() => void>()
export const onHistoryChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } }
const changed = () => listeners.forEach(f => f())

// ── Consultas ───────────────────────────────────────────────────────────────────
export async function listExecutions(): Promise<ExecMeta[]> {
  try {
    const all = await tx(['meta'], 'readonly', t => req(t.objectStore('meta').getAll() as IDBRequest<ExecMeta[]>))
    return all.sort((a, b) => b.at - a.at)
  } catch { return [] }
}

export const getExecution = (id: string) =>
  tx(['meta', 'data'], 'readonly', async t => {
    const [meta, data] = await Promise.all([req(t.objectStore('meta').get(id)), req(t.objectStore('data').get(id))])
    return meta && data ? { meta: meta as ExecMeta, data: data as ExecData } : null
  })

export async function deleteExecution(id: string) {
  await tx(['meta', 'data'], 'readwrite', t => { t.objectStore('meta').delete(id); t.objectStore('data').delete(id) })
  changed()
}

/** Borra el historial (de un flujo, o todo si flowId es null), conservando las fijadas. */
export async function clearExecutions(keepPinned = true, flowId: string | null = null) {
  const all = (await listExecutions()).filter(m => flowId === null || m.flowId === flowId)
  await tx(['meta', 'data'], 'readwrite', t => {
    for (const m of all) if (!(keepPinned && m.pinned)) { t.objectStore('meta').delete(m.id); t.objectStore('data').delete(m.id) }
  })
  changed()
}

/** Borra todas las ejecuciones de un flujo (al borrar el flujo). */
export async function deleteExecutionsOfFlow(flowId: string) {
  const ids = (await listExecutions()).filter(m => m.flowId === flowId).map(m => m.id)
  if (!ids.length) return
  await tx(['meta', 'data'], 'readwrite', t => { for (const id of ids) { t.objectStore('meta').delete(id); t.objectStore('data').delete(id) } })
  changed()
}

export async function updateMeta(id: string, patch: Partial<Pick<ExecMeta, 'pinned' | 'name'>>) {
  await tx(['meta'], 'readwrite', async t => {
    const s = t.objectStore('meta')
    const m = await req(s.get(id)) as ExecMeta | undefined
    if (m) s.put({ ...m, ...patch })
  })
  changed()
}

// ── Registro ───────────────────────────────────────────────────────────────────
export const autoEnabled = () => { try { return localStorage.getItem(AUTO_KEY) !== 'off' } catch { return true } }
export const setAutoEnabled = (on: boolean) => { try { localStorage.setItem(AUTO_KEY, on ? 'on' : 'off') } catch { /* sin almacenamiento */ } changed() }

/** Firma del flujo sin posiciones: dos ejecuciones con la misma firma dieron el mismo resultado. */
export const graphSig = (nodes: OpNodeT[], edges: DataEdgeT[]) =>
  JSON.stringify([nodes.map(n => [n.id, n.data.op, n.data.args ?? n.data.params]).sort(), edges.map(e => [e.source, e.target, e.targetHandle ?? 'in0']).sort()])

/** Guarda una ejecución. Devuelve su id, o null si se omitió por repetida (solo en modo automático). */
export async function recordExecution(flowId: string | null, nodes: OpNodeT[], edges: DataEdgeT[], results: Record<string, Result>, name: string, mode: ExecMeta['mode'], extra: Partial<Pick<ExecMeta, 'labPassed'>> = {}): Promise<string | null> {
  if (!nodes.length) return null
  const sig = graphSig(nodes, edges)
  const recent = (await listExecutions()).filter(m => (m.flowId ?? null) === flowId)
  if (mode === 'auto' && recent.slice(0, DEDUPE_WINDOW).some(m => m.sig === sig)) return null

  const out: Record<string, ExecNodeData> = {}
  let errors = 0, ms = 0
  for (const n of nodes) {
    const r = results[n.id]
    if (!r) continue
    if (!r.ok) { errors++; out[n.id] = { ok: false, err: r.err }; continue }
    const b = r.bytes ?? new Uint8Array(0)
    const cut = b.length > MAX_NODE_BYTES
    out[n.id] = { ok: true, type: r.type, bytes: cut ? b.slice(0, MAX_NODE_BYTES) : b.slice(), ms: r.ms, ...(cut ? { size: b.length } : {}) }
    if (n.data.op !== '__output') ms += r.ms ?? 0
  }
  const id = newId('x')
  const meta: ExecMeta = { id, ...(flowId ? { flowId } : {}), at: Date.now(), name, mode, pinned: mode === 'manual', ok: errors === 0, errors, blocks: nodes.length, ms: Math.round(ms * 10) / 10, sig, ...extra }
  const data: ExecData = { id, graph: serializeGraph(nodes, edges), results: out }
  await tx(['meta', 'data'], 'readwrite', t => { t.objectStore('meta').put(meta); t.objectStore('data').put(data) })
  await prune()
  changed()
  return id
}

/** Borra las ejecuciones no fijadas más antiguas por encima del límite de cada flujo. */
async function prune() {
  const byFlow = new Map<string, ExecMeta[]>()
  for (const m of await listExecutions()) if (!m.pinned) {
    const k = m.flowId ?? ''
    byFlow.set(k, [...(byFlow.get(k) ?? []), m])
  }
  const extra = [...byFlow.values()].flatMap(l => l.slice(MAX_EXECS))
  if (!extra.length) return
  await tx(['meta', 'data'], 'readwrite', t => { for (const m of extra) { t.objectStore('meta').delete(m.id); t.objectStore('data').delete(m.id) } })
}

// ── Reconstrucción ─────────────────────────────────────────────────────────────
/** Convierte los bytes guardados en resultados como los del motor (dish de CyberChef incluido),
 *  para que el lienzo y el panel de detalle funcionen igual que en una ejecución en vivo. */
export async function hydrateResults(data: ExecData): Promise<Record<string, Result>> {
  const out: Record<string, Result> = {}
  let serial = -1
  for (const n of data.graph.nodes) {
    const r = data.results[n.id]
    if (!r) continue
    if (!r.ok) { out[n.id] = { ok: false, err: r.err, serial: serial-- }; continue }
    const bytes = r.bytes ?? new Uint8Array(0)
    const dish = bytesDish(bytes)
    if (r.type && r.type !== 'ArrayBuffer') { try { await dish.get(r.type) } catch { /* se queda como bytes */ } }
    let op: any
    if (!isCustom(n.op)) {
      try { const Op = await loadOpClass(n.op); op = new Op(); op.ingValues = n.args ?? [] } catch { op = undefined }
    }
    out[n.id] = { ok: true, serial: serial--, dish, type: r.type, bytes, ms: r.ms, op }
  }
  return out
}

/** Flujo de una ejecución en el formato de «Exportar» (se puede volver a importar). */
export const exportExecution = (data: ExecData) => JSON.stringify(data.graph, null, 1)
