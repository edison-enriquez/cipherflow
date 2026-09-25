// Recalcula el grafo cuando cambian los bloques, sus parámetros o los cables (no al moverlos),
// y guarda el flujo en el navegador.
import { useEffect } from 'react'
import { useStore } from './store'
import { runGraph } from '../engine/graph'
import type { DataEdgeT, OpNodeT } from '../engine/types'

const STORAGE = 'cipherflow.v3'
let waiters: (() => void)[] = []
let pending = false

/** Resuelve cuando los resultados reflejan el estado actual del grafo. */
export const waitForRun = () => pending ? new Promise<void>(r => waiters.push(r)) : Promise.resolve()

export function useGraphRunner(ready: boolean) {
  useEffect(() => {
    if (!ready) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let tok = 0
    let last = ''
    const sig = (s: { nodes: OpNodeT[]; edges: DataEdgeT[] }) =>
      JSON.stringify([s.nodes.map(n => [n.id, n.data]), s.edges.map(e => [e.source, e.target, e.targetHandle])])
    const trigger = () => {
      pending = true
      clearTimeout(timer)
      timer = setTimeout(async () => {
        const t = ++tok
        const { nodes, edges } = useStore.getState()
        const r = await runGraph(nodes, edges)
        if (t !== tok) return
        useStore.getState().setResults(r)
        pending = false
        const w = waiters; waiters = []; w.forEach(f => f())
      }, 200)
    }
    const check = () => { const s = sig(useStore.getState()); if (s !== last) { last = s; trigger() } }
    const unsub = useStore.subscribe(check)
    last = sig(useStore.getState())
    trigger()
    return () => { unsub(); clearTimeout(timer) }
  }, [ready])
}

export function usePersistence(ready: boolean) {
  useEffect(() => {
    if (!ready) return
    let timer: ReturnType<typeof setTimeout> | undefined
    return useStore.subscribe((s, prev) => {
      if (s.nodes === prev.nodes && s.edges === prev.edges) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        try {
          const { nodes, edges } = useStore.getState()
          localStorage.setItem(STORAGE, JSON.stringify(serializeGraph(nodes, edges)))
        } catch { /* sin espacio o almacenamiento bloqueado */ }
      }, 500)
    })
  }, [ready])
}

export interface SavedGraph {
  nodes: { id: string; op: string; x: number; y: number; args?: any[]; params?: Record<string, any> }[]
  edges: { from: string; to: string; port: number }[]
}

export function serializeGraph(nodes: OpNodeT[], edges: DataEdgeT[]): SavedGraph {
  return {
    nodes: nodes.map(n => ({ id: n.id, op: n.data.op, x: Math.round(n.position.x), y: Math.round(n.position.y), ...(n.data.params ? { params: n.data.params } : { args: n.data.args }) })),
    edges: edges.map(e => ({ from: e.source, to: e.target, port: Number(String(e.targetHandle ?? 'in0').slice(2)) || 0 })),
  }
}

export function loadSaved(): SavedGraph | null {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE) || 'null')
    return d && Array.isArray(d.nodes) && d.nodes.length ? d : null
  } catch { return null }
}
