// Recalcula el grafo cuando cambian los bloques, sus parámetros o los cables (no al moverlos).
// El guardado de flujos está en flows.ts; aquí quedan el formato y la lectura del guardado antiguo.
import { useEffect } from 'react'
import { useStore } from './store'
import { runGraph } from '../engine/graph'
import type { DataEdgeT, OpNodeT } from '../engine/types'

const STORAGE = 'cipherflow.v3'
const NAME_KEY = 'cipherflow.nombre'
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
      const done = () => { pending = false; const w = waiters; waiters = []; w.forEach(f => f()) }
      timer = setTimeout(async () => {
        const t = ++tok
        if (useStore.getState().mode === 'executions') return done()
        const { nodes, edges } = useStore.getState()
        const r = await runGraph(nodes, edges)
        if (t !== tok) return
        // Si mientras tanto se abrió el historial, estos resultados ya no corresponden al lienzo
        if (useStore.getState().mode === 'executions') return done()
        useStore.getState().setResults(r)
        done()
      }, 200)
    }
    // En el historial el lienzo muestra datos guardados: no se recalcula ni se toca la firma,
    // así al volver al editor (mismo flujo) no hay nada que recalcular.
    let mode = useStore.getState().mode
    const check = () => {
      const st = useStore.getState()
      const back = mode === 'executions' && st.mode !== 'executions'
      mode = st.mode
      if (st.mode === 'executions') return
      const s = sig(st)
      // Al volver del historial se recalcula siempre (la caché por bloque lo hace inmediato)
      if (s !== last || back) { last = s; trigger() }
    }
    const unsub = useStore.subscribe(check)
    last = sig(useStore.getState())
    trigger()
    return () => { unsub(); clearTimeout(timer) }
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

export function loadSavedName(): string | null {
  try { return localStorage.getItem(NAME_KEY) } catch { return null }
}

export function loadSaved(): SavedGraph | null {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE) || 'null')
    return d && Array.isArray(d.nodes) && d.nodes.length ? d : null
  } catch { return null }
}
