import { create } from 'zustand'
import { applyEdgeChanges, applyNodeChanges, type Connection, type EdgeChange, type NodeChange } from '@xyflow/react'
import type { DataEdgeT, OpData, OpNodeT, Result } from '../engine/types'
import { customDefaults, isCustom } from '../engine/catalog'
import { defaultArgs } from '../engine/cyberchef'
import { clearCache, invalidate, topoOrder, wouldCycle } from '../engine/graph'

export type DetailTab = 'in' | 'par' | 'out' | 'proc'

interface StepState {
  on: boolean
  order: string[]
  idx: number
  done: string[]
  active: string | null
  hot: string[]
  playing: boolean
  speed: number
}

interface State {
  nodes: OpNodeT[]
  edges: DataEdgeT[]
  results: Record<string, Result>
  busy: Record<string, boolean>
  detail: { id: string; tab: DetailTab } | null
  step: StepState
  toast: { msg: string; t: number } | null
  paletteOpen: boolean
  logOpen: boolean
  /** «home» (Mis flujos), «editor» o «executions» (historial al estilo de n8n). */
  mode: 'home' | 'editor' | 'executions'
  /** Ejecuciones que se listan: las de un flujo (su id) o todas (null). */
  execScope: string | null
  /** Flujo guardado que está abierto en el editor; null si es un borrador de ejemplo o laboratorio
   *  que aún no se ha modificado (se guarda como flujo al primer cambio). */
  flowId: string | null
  /** Cambia cada vez que se abre otro flujo o borrador (no al guardarse el borrador). */
  session: number
  flowOrigin: { origin: string; key?: string } | null
  saveState: 'saved' | 'saving'
  /** Ejecución guardada que se muestra en el lienzo (solo lectura), o null. */
  viewing: string | null
  /** Nombre con el que se registran las ejecuciones del flujo actual. */
  flowName: string
  /** Flujo del editor apartado mientras se miran ejecuciones. */
  stash: { nodes: OpNodeT[]; edges: DataEdgeT[]; results: Record<string, Result> } | null

  onNodesChange: (c: NodeChange<OpNodeT>[]) => void
  onEdgesChange: (c: EdgeChange<DataEdgeT>[]) => void
  connect: (c: Connection) => boolean
  addNode: (op: string, position: { x: number; y: number }, data?: Partial<OpData>, from?: string) => string
  updateData: (id: string, patch: Partial<OpData>) => void
  removeNode: (id: string) => void
  setGraph: (nodes: OpNodeT[], edges: DataEdgeT[]) => void
  setResults: (r: Record<string, Result>) => void
  setBusy: (id: string, v: boolean) => void
  openDetail: (id: string, tab?: DetailTab) => void
  closeDetail: () => void
  setDetailTab: (t: DetailTab) => void
  showToast: (msg: string) => void
  setPaletteOpen: (v: boolean) => void
  setLogOpen: (v: boolean) => void
  setStep: (s: Partial<StepState>) => void
  startStep: () => void
  stopStep: () => void
  setFlowName: (n: string) => void
  setFlow: (id: string, name: string, origin: { origin: string; key?: string } | null) => void
  /** Abre un grafo en el editor como otro flujo (guardado, o borrador con id null) de una sola vez. */
  openFlow: (nodes: OpNodeT[], edges: DataEdgeT[], flow: { id: string | null; name: string; origin: { origin: string; key?: string } | null }) => void
  setMode: (m: 'home' | 'editor') => void
  enterExecutions: (scope: string | null) => void
  viewExecution: (id: string, nodes: OpNodeT[], edges: DataEdgeT[], results: Record<string, Result>) => void
  exitExecutions: (restore?: boolean) => void
}

const uid = () => 'n' + Math.random().toString(36).slice(2, 9)
export const edgeId = (source: string, target: string, handle: string) => `e-${source}-${target}-${handle}`
const idleStep: StepState = { on: false, order: [], idx: 0, done: [], active: null, hot: [], playing: false, speed: 1 }

export function makeNode(op: string, position: { x: number; y: number }, data?: Partial<OpData>): OpNodeT {
  const d: OpData = { op }
  if (isCustom(op)) d.params = { ...customDefaults(op), ...(data?.params ?? {}) }
  else {
    d.args = defaultArgs(op)
    data?.args?.forEach((v, i) => { if (v !== undefined && i < d.args!.length) d.args![i] = v })
  }
  return { id: uid(), type: 'op', position, data: d }
}

export const useStore = create<State>((set, get) => ({
  nodes: [],
  edges: [],
  results: {},
  busy: {},
  detail: null,
  step: idleStep,
  toast: null,
  paletteOpen: false,
  logOpen: false,
  mode: 'editor',
  execScope: null,
  flowId: null,
  flowOrigin: null,
  session: 0,
  saveState: 'saved',
  viewing: null,
  flowName: 'Flujo propio',
  stash: null,

  onNodesChange: changes => {
    // En el historial solo se permiten cambios de vista (medidas y selección), nunca de contenido
    if (get().mode === 'executions') changes = changes.filter(c => c.type === 'dimensions' || c.type === 'select')
    const removed = changes.filter(c => c.type === 'remove').map(c => (c as { id: string }).id)
    removed.forEach(invalidate)
    set(s => ({
      nodes: applyNodeChanges(changes, s.nodes),
      edges: removed.length ? s.edges.filter(e => !removed.includes(e.source) && !removed.includes(e.target)) : s.edges,
      detail: s.detail && removed.includes(s.detail.id) ? null : s.detail,
      step: removed.length && s.step.on ? idleStep : s.step,
    }))
  },
  onEdgesChange: changes => get().mode === 'executions' ? set(s => ({ edges: applyEdgeChanges(changes.filter(c => c.type === 'select'), s.edges) })) : set(s => ({ edges: applyEdgeChanges(changes, s.edges), step: changes.some(c => c.type === 'remove') && s.step.on ? idleStep : s.step })),

  connect: c => {
    const { edges } = get()
    if (!c.source || !c.target || get().mode === 'executions') return false
    if (wouldCycle(edges, c.source, c.target)) { get().showToast('Esa conexión crearía un ciclo'); return false }
    const th = c.targetHandle ?? 'in0'
    const rest = edges.filter(e => !(e.target === c.target && (e.targetHandle ?? 'in0') === th))
    set({ edges: [...rest, { id: edgeId(c.source, c.target, th), source: c.source, target: c.target, sourceHandle: 'out', targetHandle: th, type: 'data' }], step: idleStep })
    return true
  },

  addNode: (op, position, data, from) => {
    if (get().mode === 'executions') return ''
    const n = makeNode(op, position, data)
    set(s => ({
      nodes: [...s.nodes.map(m => ({ ...m, selected: false })), { ...n, selected: true }],
      edges: from ? [...s.edges, { id: edgeId(from, n.id, 'in0'), source: from, target: n.id, sourceHandle: 'out', targetHandle: 'in0', type: 'data' }] : s.edges,
      step: idleStep,
    }))
    return n.id
  },

  updateData: (id, patch) => {
    if (get().mode === 'executions') return
    invalidate(id)
    set(s => ({ nodes: s.nodes.map(n => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n), step: s.step.on ? idleStep : s.step }))
  },

  removeNode: id => get().onNodesChange([{ type: 'remove', id }]),

  setGraph: (nodes, edges) => { clearCache(); set({ nodes, edges, results: {}, detail: null, step: idleStep }) },
  setResults: results => set({ results }),
  setBusy: (id, v) => set(s => ({ busy: { ...s.busy, [id]: v } })),
  openDetail: (id, tab) => set(s => ({ detail: { id, tab: tab ?? s.detail?.tab ?? 'par' } })),
  closeDetail: () => set({ detail: null }),
  setDetailTab: tab => set(s => ({ detail: s.detail ? { ...s.detail, tab } : null })),
  showToast: msg => set({ toast: { msg, t: Date.now() } }),
  setPaletteOpen: v => set({ paletteOpen: v }),
  setLogOpen: v => set({ logOpen: v }),
  setStep: p => set(s => ({ step: { ...s.step, ...p } })),
  startStep: () => set(s => ({ step: { ...idleStep, on: true, speed: s.step.speed, order: topoOrder(s.nodes, s.edges) }, logOpen: true })),
  stopStep: () => set(s => ({ step: { ...idleStep, speed: s.step.speed } })),
  setFlowName: flowName => set({ flowName }),
  setFlow: (flowId, flowName, flowOrigin) => set({ flowId, flowName, flowOrigin, saveState: 'saved' }),
  openFlow: (nodes, edges, f) => {
    clearCache()
    set(s => ({ nodes, edges, results: {}, detail: null, step: idleStep, flowId: f.id, flowName: f.name, flowOrigin: f.origin, saveState: 'saved', session: s.session + 1 }))
  },
  setMode: mode => set(s => s.mode === 'executions'
    ? { mode, viewing: null, stash: null, detail: null, ...(s.stash ?? {}) }
    : { mode, detail: null }),
  enterExecutions: execScope => set(s => s.mode === 'executions'
    ? (s.execScope === execScope ? {} : { execScope, viewing: null, nodes: [], edges: [], results: {}, detail: null })
    : {
        mode: 'executions', execScope, viewing: null, stash: { nodes: s.nodes, edges: s.edges, results: s.results },
        nodes: [], edges: [], results: {}, detail: null, step: idleStep,
      }),
  viewExecution: (id, nodes, edges, results) => set({ viewing: id, nodes, edges, results, detail: null }),
  exitExecutions: (restore = true) => set(s => ({
    mode: 'editor', viewing: null, stash: null, detail: null,
    ...(restore && s.stash ? s.stash : {}),
  })),
}))

/** ¿Se debe mostrar el resultado de este bloque? En modo paso a paso, solo si ya se ejecutó. */
export const isRevealed = (step: StepState, id: string) => !step.on || step.done.includes(id)
