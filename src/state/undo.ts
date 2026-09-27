// Deshacer / rehacer del lienzo (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z).
// Se guarda una foto del grafo cuando los cambios se asientan: un arrastre o una ráfaga de
// tecleo en los parámetros cuentan como un solo paso. Selección y medidas no son cambios.
import { useEffect } from 'react'
import { useStore } from './store'
import { clearCache } from '../engine/graph'
import type { DataEdgeT, OpNodeT } from '../engine/types'

interface Snap { nodes: OpNodeT[]; edges: DataEdgeT[]; key: string }

const LIMIT = 100
let past: Snap[] = []
let future: Snap[] = []
let current: Snap | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let applying = false

const keyOf = (nodes: OpNodeT[], edges: DataEdgeT[]) => JSON.stringify([
  nodes.map(n => [n.id, Math.round(n.position.x), Math.round(n.position.y), n.data]),
  edges.map(e => [e.source, e.target, e.targetHandle]),
])
const snap = (): Snap => { const { nodes, edges } = useStore.getState(); return { nodes, edges, key: keyOf(nodes, edges) } }

/** Registra el estado actual como un paso nuevo si difiere del último. */
function commit() {
  clearTimeout(timer)
  timer = undefined
  const s = snap()
  if (!current) { current = s; return }
  if (s.key === current.key) { current = s; return }
  past.push(current)
  if (past.length > LIMIT) past.shift()
  future = []
  current = s
}

/** Empieza un historial limpio con el estado actual (al abrir otro flujo). */
export function resetHistory() {
  clearTimeout(timer)
  timer = undefined
  past = []
  future = []
  current = snap()
}

function restore(s: Snap) {
  applying = true
  clearCache()
  const sel = new Set(useStore.getState().nodes.filter(n => n.selected).map(n => n.id))
  useStore.setState(st => ({
    nodes: s.nodes.map(n => ({ ...n, selected: sel.has(n.id) })),
    edges: s.edges,
    detail: st.detail && s.nodes.some(n => n.id === st.detail!.id) ? st.detail : null,
  }))
  useStore.getState().stopStep()
  current = s
  applying = false
}

export function undo() {
  if (timer) commit()
  const prev = past.pop()
  if (!prev || !current) return false
  future.push(current)
  restore(prev)
  return true
}

export function redo() {
  if (timer) commit()
  const next = future.pop()
  if (!next || !current) return false
  past.push(current)
  restore(next)
  return true
}

const editable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

export function useUndoHistory(ready: boolean) {
  useEffect(() => {
    if (!ready) return
    resetHistory()
    const unsub = useStore.subscribe((s, prev) => {
      if (applying) return
      if (s.session !== prev.session) return resetHistory()
      if (s.mode !== 'editor') { clearTimeout(timer); timer = undefined; return }
      // Al volver del historial de ejecuciones el lienzo recupera lo que tenía: no es una edición
      if (prev.mode !== 'editor') { current = snap(); return }
      if (s.nodes === prev.nodes && s.edges === prev.edges) return
      // Mientras se arrastra no se registra nada; el paso se guarda al soltar
      if (s.nodes.some(n => n.dragging)) { clearTimeout(timer); timer = undefined; return }
      clearTimeout(timer)
      timer = setTimeout(commit, 350)
    })
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || editable(e.target)) return
      if (useStore.getState().mode !== 'editor') return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); if (!undo()) useStore.getState().showToast('Nada que deshacer') }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); if (!redo()) useStore.getState().showToast('Nada que rehacer') }
    }
    window.addEventListener('keydown', onKey)
    return () => { unsub(); window.removeEventListener('keydown', onKey); clearTimeout(timer) }
  }, [ready])
}
