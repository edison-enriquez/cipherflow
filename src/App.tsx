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
import { loadSaved, usePersistence, useGraphRunner, waitForRun } from './state/runner'
import { loadEngine } from './engine/cyberchef'
import { buildCatalog, opInfo } from './engine/catalog'
import { buildExample, exportText, graphFromSaved, parseImport, recipeTo } from './io'
import { useMedia, useTheme } from './hooks/useTheme'

export default function App() {
  const { theme, toggle } = useTheme()
  const compact = useMedia('(max-width: 767px)')
  const rf = useReactFlow()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [io, setIo] = useState<'export' | 'import' | null>(null)
  const paletteOpen = useStore(s => s.paletteOpen)
  const setPaletteOpen = useStore(s => s.setPaletteOpen)
  const setGraph = useStore(s => s.setGraph)
  const addNode = useStore(s => s.addNode)
  const openDetail = useStore(s => s.openDetail)
  const showToast = useStore(s => s.showToast)
  const setLogOpen = useStore(s => s.setLogOpen)

  const fit = useCallback(() => setTimeout(() => rf.fitView({ padding: 0.25, duration: 250 }), 60), [rf])

  const loadExample = useCallback((name: string, openIt = true) => {
    const ex = buildExample(name)
    setGraph(ex.nodes, ex.edges)
    fit()
    if (openIt && ex.open && !compact) waitForRun().then(() => setTimeout(() => openDetail(ex.open!, 'proc'), 350))
  }, [setGraph, fit, compact, openDetail])

  useEffect(() => {
    loadEngine().then(() => {
      buildCatalog()
      const saved = loadSaved()
      if (saved) { const g = graphFromSaved(saved); setGraph(g.nodes, g.edges); fit() }
      else loadExample('AES-CBC por dentro', false)
      if (!matchMedia('(max-width: 767px)').matches) setLogOpen(false)
      setReady(true)
    }).catch(e => setError(e?.message ?? String(e)))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useGraphRunner(ready)
  usePersistence(ready)

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

  const onImport = (text: string) => {
    try {
      const g = parseImport(text)
      setGraph(g.nodes, g.edges)
      setIo(null)
      fit()
      showToast(g.skipped ? `Importado; se omitieron ${g.skipped} pasos de control de flujo` : 'Importado')
    } catch { showToast('El JSON no es válido') }
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
        onExample={name => loadExample(name)}
        onExport={() => setIo('export')}
        onImport={() => setIo('import')}
        onClear={() => { if (!useStore.getState().nodes.length || confirm('¿Borrar todos los bloques del lienzo?')) setGraph([], []) }}
        onMenu={() => setPaletteOpen(true)}
      />
      {!ready ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <span className="flex items-center gap-2 text-lg font-bold uppercase tracking-[0.24em]"><span className="h-2.5 w-2.5 bg-green" />CipherFlow</span>
          <p className="label">Cargando el motor de CyberChef…</p>
          <div className="h-0.5 w-56 overflow-hidden bg-border"><div className="h-full w-1/3 animate-pulse bg-green" /></div>
        </div>
      ) : (
        <main className="relative flex min-h-0 flex-1">
          <Palette onAdd={addFromPalette} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
          {compact && paletteOpen && <div className="absolute inset-0 z-20 bg-base/60" onClick={() => setPaletteOpen(false)} />}
          <div ref={canvasRef} className="relative min-w-0 flex-1">
            <Canvas compact={compact} />
            <Transport />
            <LogPanel />
            {!useStore.getState().nodes.length && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center p-8 text-center text-[13px] leading-loose text-muted">
                <p>Agrega una Entrada desde la lista y encadena operaciones.<br />Arrastra desde un pin de salida (derecha) hasta uno de entrada (izquierda).</p>
              </div>
            )}
          </div>
        </main>
      )}
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
