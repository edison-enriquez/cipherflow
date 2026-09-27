import { useCallback, useEffect, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import Header from './components/Header'
import Palette from './components/Palette'
import Transport from './components/Transport'
import LogPanel from './components/LogPanel'
import Toast from './components/Toast'
import IODialog from './components/IODialog'
import Canvas from './canvas/Canvas'
import { NODE_W } from './canvas/OpNode'
import NodeDetail from './detail/NodeDetail'
import { useStore } from './state/store'
import { loadSaved, loadSavedName, serializeGraph, useGraphRunner, waitForRun } from './state/runner'
import { useExecutionRecorder } from './state/recorder'
import { createFlow, findByOrigin, getFlow, lastFlowId, listFlows, setLastFlowId, uniqueName, useFlowAutosave } from './state/flows'
import { ExecutionBar, ExecutionsPanel } from './components/Executions'
import FlowsPage from './components/FlowsPage'
import FlowBar from './components/FlowBar'
import { loadEngine } from './engine/cyberchef'
import { buildCatalog, opInfo } from './engine/catalog'
import { buildExample, exportText, graphFromSaved, parseImport, recipeTo } from './io'
import { LABS, buildLab } from './labs'
import LabBrief from './components/LabBrief'
import { go, useRoute } from './router'
import { useMedia, useTheme } from './hooks/useTheme'

const DEFAULT_EXAMPLE = 'AES-CBC por dentro'
/** «1 · El pingüino de ECB» → «Lab 1 · El pingüino de ECB» */
const labName = (titulo: string) => titulo.replace(/^(\d+)\s*·\s*/, 'Lab $1 · ')

/** Primera vez con flujos: el trabajo que había en el navegador pasa a ser un flujo guardado. */
async function migrate() {
  if ((await listFlows()).length) return
  const saved = loadSaved()
  if (saved) await createFlow({ name: loadSavedName() || 'Mi primer flujo', origin: 'own', graph: saved })
  else {
    const ex = buildExample(DEFAULT_EXAMPLE)
    await createFlow({ name: DEFAULT_EXAMPLE, origin: 'example', originKey: DEFAULT_EXAMPLE, graph: serializeGraph(ex.nodes, ex.edges) })
  }
}

export default function App() {
  const { theme, toggle } = useTheme()
  const compact = useMedia('(max-width: 767px)')
  const rf = useReactFlow()
  const route = useRoute()
  const canvasRef = useRef<HTMLDivElement>(null)
  /** Bloque cuyo detalle se abre al terminar de cargar un laboratorio o ejemplo recién creado. */
  const pendingDetail = useRef<string | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [io, setIo] = useState<'export' | 'import' | null>(null)
  const [briefOpen, setBriefOpen] = useState(false)
  const paletteOpen = useStore(s => s.paletteOpen)
  const setPaletteOpen = useStore(s => s.setPaletteOpen)
  const addNode = useStore(s => s.addNode)
  const openDetail = useStore(s => s.openDetail)
  const showToast = useStore(s => s.showToast)
  const setLogOpen = useStore(s => s.setLogOpen)
  const mode = useStore(s => s.mode)
  const viewing = useStore(s => s.viewing)
  const hasNodes = useStore(s => s.nodes.length > 0)
  const origin = useStore(s => s.flowOrigin)
  const lab = origin?.origin === 'lab' && origin.key ? LABS[origin.key] ?? null : null

  const fit = useCallback(() => setTimeout(() => rf.fitView({ padding: 0.25, duration: 250 }), 60), [rf])

  /** Carga un flujo guardado en el editor (sin navegar). */
  const loadFlow = useCallback(async (id: string) => {
    const f = await getFlow(id)
    if (!f) return false
    const st = useStore.getState()
    if (st.mode === 'executions') st.exitExecutions(false)
    const g = graphFromSaved(f.graph)
    st.setGraph(g.nodes, g.edges)
    st.setFlow(f.id, f.name, { origin: f.origin, key: f.originKey })
    setLastFlowId(f.id)
    fit()
    return true
  }, [fit])

  useEffect(() => {
    loadEngine().then(async () => {
      buildCatalog()
      try { await migrate() } catch { showToast('Este navegador no permite guardar flujos: los cambios no se conservarán') }
      if (!matchMedia('(max-width: 767px)').matches) setLogOpen(false)
      setReady(true)
    }).catch(e => setError(e?.message ?? String(e)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // La URL manda: cada cambio de ruta abre la vista correspondiente
  const routeKey = JSON.stringify(route)
  useEffect(() => {
    if (!ready) return
    let alive = true
    ;(async () => {
      const st = useStore.getState()
      if (route.view === 'none') {
        // Sin ruta: se vuelve al último flujo usado (o al más reciente)
        const last = lastFlowId()
        const f = (last && await getFlow(last)) || (await listFlows())[0]
        go(f ? { view: 'flow', id: f.id, tab: 'editor' } : { view: 'home' }, true)
        return
      }
      if (route.view === 'home') { setBriefOpen(false); st.setMode('home'); return }
      if (route.view === 'executions') {
        setBriefOpen(false)
        setPaletteOpen(compact)
        st.enterExecutions(null)
        return
      }
      if (st.flowId !== route.id && !(await loadFlow(route.id))) {
        if (alive) { showToast('Ese flujo ya no existe'); go({ view: 'home' }, true) }
        return
      }
      if (!alive) return
      const s2 = useStore.getState()
      if (route.tab === 'executions') {
        setPaletteOpen(compact)
        s2.enterExecutions(route.id)
      } else {
        if (s2.mode === 'executions') s2.exitExecutions()
        else if (s2.mode === 'home') s2.setMode('editor')
        const nid = pendingDetail.current
        pendingDetail.current = null
        if (nid && !compact) waitForRun().then(() => setTimeout(() => openDetail(nid, 'proc'), 350))
      }
    })()
    return () => { alive = false }
  }, [ready, routeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useGraphRunner(ready)
  useFlowAutosave(ready)
  useExecutionRecorder(ready)

  /** Abre el flujo de un laboratorio o ejemplo; si no existe aún, lo crea desde la plantilla. */
  const openTemplate = async (kind: 'lab' | 'example', key: string) => {
    let f = await findByOrigin(kind, key)
    if (!f) {
      const g = kind === 'lab' ? buildLab(key) : buildExample(key)
      f = await createFlow({ name: kind === 'lab' ? labName(LABS[key].titulo) : key, origin: kind, originKey: key, graph: serializeGraph(g.nodes, g.edges) })
      pendingDetail.current = g.open ?? null
    }
    setBriefOpen(kind === 'lab')
    go({ view: 'flow', id: f.id, tab: 'editor' })
  }

  /** «Reiniciar el laboratorio / desde el ejemplo»: vuelve a la plantilla (lo anterior queda en Ejecuciones). */
  const resetTemplate = () => {
    const o = useStore.getState().flowOrigin
    if (!o?.key || (o.origin !== 'lab' && o.origin !== 'example')) return
    if (!confirm('¿Volver al estado inicial? Tus cambios se reemplazan (las ejecuciones anteriores siguen en el historial).')) return
    const g = o.origin === 'lab' ? buildLab(o.key) : buildExample(o.key)
    useStore.getState().setGraph(g.nodes, g.edges)
    fit()
    if (o.origin === 'lab') setBriefOpen(true)
    showToast('Flujo reiniciado')
  }

  const newFlow = async () => {
    const f = await createFlow({ name: await uniqueName('Flujo nuevo'), origin: 'own', graph: { nodes: [], edges: [] } })
    setBriefOpen(false)
    go({ view: 'flow', id: f.id, tab: 'editor' })
  }

  const addFromPalette = (op: string) => {
    const { nodes } = useStore.getState()
    const sel = nodes.find(n => n.selected)
    const chain = !!sel && opInfo(op).inputs > 0 && sel.data.op !== '__output'
    const overlaps = (x: number, y: number) => nodes.some(m => Math.abs(m.position.x - x) < NODE_W - 20 && Math.abs(m.position.y - y) < 80)
    let x: number, y: number
    if (chain) {
      x = sel!.position.x + NODE_W + 110; y = sel!.position.y
      while (overlaps(x, y)) y += 120
    } else {
      const r = canvasRef.current!.getBoundingClientRect()
      const p = rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 3 })
      x = p.x - NODE_W / 2; y = p.y
      while (overlaps(x, y)) { x += 28; y += 28 }
    }
    addNode(op, { x, y }, undefined, chain ? sel!.id : undefined)
    if (compact) setPaletteOpen(false)
    setTimeout(() => {
      const z = rf.getZoom()
      const r = canvasRef.current!.getBoundingClientRect()
      const s = rf.flowToScreenPosition({ x, y })
      if (s.x < r.left || s.x + NODE_W * z > r.right || s.y < r.top + 50 || s.y + 110 * z > r.bottom) rf.setCenter(x + NODE_W / 2, y + 60, { zoom: z, duration: 250 })
    }, 30)
  }

  /** Importar crea un flujo nuevo (no pisa el abierto). */
  const onImport = async (text: string) => {
    let g
    try { g = parseImport(text) } catch { showToast('El JSON no es válido'); return }
    const f = await createFlow({ name: await uniqueName('Flujo importado'), origin: 'import', graph: serializeGraph(g.nodes, g.edges) })
    setIo(null)
    setBriefOpen(false)
    go({ view: 'flow', id: f.id, tab: 'editor' })
    showToast(g.skipped ? `Importado como flujo nuevo; se omitieron ${g.skipped} pasos de control de flujo` : 'Importado como flujo nuevo')
  }

  const { nodes, edges } = useStore.getState()
  const selected = nodes.find(n => n.selected)
  const recipe = io === 'export' && selected ? recipeTo(selected.id, nodes, edges) : []

  if (error) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div><p className="label mb-2 text-red">No se pudo iniciar el motor de CyberChef</p><p className="text-xs text-muted">{error}</p></div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <Header
        theme={theme}
        onToggleTheme={toggle}
        onHome={() => go({ view: 'home' })}
        onExample={name => openTemplate('example', name)}
        onLab={id => openTemplate('lab', id)}
        onNew={newFlow}
        onImport={() => setIo('import')}
        onMenu={() => setPaletteOpen(true)}
        home={mode === 'home'}
        showMenu={mode !== 'home'}
      />
      {!ready ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <span className="flex items-center gap-2 text-lg font-bold uppercase tracking-[0.24em]"><span className="h-2.5 w-2.5 bg-green" />CipherFlow</span>
          <p className="label">Cargando el motor de CyberChef…</p>
          <div className="h-0.5 w-56 overflow-hidden bg-border"><div className="h-full w-1/3 animate-pulse bg-green" /></div>
        </div>
      ) : mode === 'home' ? (
        <main className="flex min-h-0 flex-1"><FlowsPage onNew={newFlow} onImport={() => setIo('import')} /></main>
      ) : (
        <main className="relative flex min-h-0 flex-1">
          {mode === 'executions'
            ? <ExecutionsPanel open={paletteOpen} onClose={() => setPaletteOpen(false)} onOpened={fit} />
            : <Palette onAdd={addFromPalette} open={paletteOpen} onClose={() => setPaletteOpen(false)} />}
          {compact && paletteOpen && <div className="absolute inset-0 z-20 bg-base/60" onClick={() => setPaletteOpen(false)} />}
          <div className="flex min-w-0 flex-1 flex-col">
            <FlowBar onExport={() => setIo('export')} onReset={resetTemplate} />
            <div ref={canvasRef} className="relative min-h-0 flex-1">
              <Canvas compact={compact} />
              {mode === 'executions' ? <ExecutionBar onRestore={fit} /> : <Transport />}
              <LogPanel />
              {mode === 'executions' && !viewing && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center p-8 text-center text-[13px] leading-loose text-muted">
                  <p>Elige una ejecución de la lista para verla tal como quedó.<br />Pulsa «Editor» para volver a tu flujo.</p>
                </div>
              )}
              {mode === 'editor' && !hasNodes && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center p-8 text-center text-[13px] leading-loose text-muted">
                  <p>Agrega una Entrada desde la lista y encadena operaciones.<br />Arrastra desde un pin de salida (derecha) hasta uno de entrada (izquierda).</p>
                </div>
              )}
            </div>
          </div>
        </main>
      )}
      {lab && !briefOpen && mode === 'editor' && (
        <button
          className="btn btn-primary fixed bottom-6 right-4 z-20 shadow-lg"
          onClick={() => setBriefOpen(true)}
          title="Ver la consigna del laboratorio"
        >
          Reto: {lab.titulo.split('·')[0].trim()} ↑
        </button>
      )}
      {lab && briefOpen && mode === 'editor' && <LabBrief lab={lab} onClose={() => setBriefOpen(false)} />}
      <NodeDetail />
      <IODialog
        mode={io}
        exportText={io === 'export' ? exportText(nodes, edges) : ''}
        recipe={recipe.length ? JSON.stringify(recipe) : null}
        onImport={onImport}
        onClose={() => setIo(null)}
        onCopied={() => showToast('Copiado')}
      />
      <Toast />
    </div>
  )
}
