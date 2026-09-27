// Flujos guardados (como los «workflows» de n8n): cada lab, ejemplo o creación propia es un
// flujo con nombre que se guarda solo mientras se edita. Cambiar de flujo ya no borra nada.
import { useEffect, useState } from 'react'
import { useStore } from './store'
import { serializeGraph, type SavedGraph } from './runner'
import { newId, req, tx } from './db'
import { deleteExecutionsOfFlow } from './history'

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

/** Autoguardado (como n8n): cada cambio del flujo abierto se guarda a los pocos cientos de ms. */
export function useFlowAutosave(ready: boolean) {
  useEffect(() => {
    if (!ready) return
    let timer: ReturnType<typeof setTimeout> | undefined
    return useStore.subscribe((s, prev) => {
      if (s.mode === 'executions' || !s.flowId) return
      if (s.nodes === prev.nodes && s.edges === prev.edges && s.flowName === prev.flowName) return
      // Cambiar de flujo no es una edición: el que se abre ya está guardado
      if (s.flowId !== prev.flowId) return
      if (s.saveState !== 'saving') useStore.setState({ saveState: 'saving' })
      clearTimeout(timer)
      timer = setTimeout(async () => {
        const st = useStore.getState()
        if (!st.flowId || st.mode === 'executions') return
        const f = await getFlow(st.flowId)
        if (f) await putFlow({ ...f, name: st.flowName, graph: serializeGraph(st.nodes, st.edges), updated: Date.now() })
        if (useStore.getState().flowId === st.flowId) useStore.setState({ saveState: 'saved' })
      }, 600)
    })
  }, [ready])
}
