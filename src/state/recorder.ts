// Conecta el editor con el historial: registra ejecuciones «asentadas» y expone la lista a React.
import { useEffect, useState } from 'react'
import { useStore } from './store'
import { waitForRun } from './runner'
import { autoEnabled, listExecutions, onHistoryChange, recordExecution, type ExecMeta } from './history'
import { labPassed } from '../labCheck'

const SETTLE_MS = 2000

/** Registra una ejecución cuando el flujo terminó de calcularse y lleva un rato sin cambios,
 *  para no guardar cada tecla del modo «En vivo». Las repetidas se omiten en history.ts. */
export function useExecutionRecorder(ready: boolean) {
  useEffect(() => {
    if (!ready) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsub = useStore.subscribe((s, prev) => {
      if (s.results === prev.results || s.mode !== 'editor') return
      clearTimeout(timer)
      const results = s.results
      timer = setTimeout(() => {
        const st = useStore.getState()
        if (st.mode !== 'editor' || st.results !== results || !autoEnabled()) return
        if (!st.flowId || !st.nodes.length || st.nodes.some(n => !st.results[n.id])) return
        recordExecution(st.flowId, st.nodes, st.edges, st.results, st.flowName, 'auto', labExtra()).catch(() => { /* sin IndexedDB */ })
      }, SETTLE_MS)
    })
    return () => { unsub(); clearTimeout(timer) }
  }, [ready])
}

/** Si el flujo es de un laboratorio, anota si cumple su criterio de éxito. */
function labExtra() {
  const { flowOrigin, nodes, results } = useStore.getState()
  return flowOrigin?.origin === 'lab' ? { labPassed: labPassed(flowOrigin.key, nodes, results) } : {}
}

/** Guarda ya la ejecución actual, fijada y con el nombre indicado. */
export async function saveCurrentExecution(name: string): Promise<string | null> {
  await waitForRun()
  const { nodes, edges, results, flowId } = useStore.getState()
  return recordExecution(flowId, nodes, edges, results, name, 'manual', labExtra())
}

/** Lista de ejecuciones (más recientes primero), actualizada con cada cambio del historial. */
export function useExecutions(): ExecMeta[] {
  const [list, setList] = useState<ExecMeta[]>([])
  useEffect(() => {
    let alive = true
    const load = () => listExecutions().then(l => { if (alive) setList(l) })
    load()
    const off = onHistoryChange(load)
    return () => { alive = false; off() }
  }, [])
  return list
}
