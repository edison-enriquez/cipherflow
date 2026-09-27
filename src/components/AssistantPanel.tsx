import { useRef, useState } from 'react'
import { AlertTriangle, Check, XCircle, Loader2, Settings, Sparkles, Square, Undo2, X } from 'lucide-react'
import { useAgentStore } from '../agent/config'
import { completeLLM } from '../agent/llm'
import { runFlowAgent, type FlowResult, type FlowStep } from '../agent/flowAgent'
import { layoutFlow } from '../agent/flowSpec'
import { applyToCanvas, catalog, describeCurrent, executeFlow, type CurrentFlow } from '../agent/runtime'
import { buildFlow } from '../io'
import { serializeGraph } from '../state/runner'
import type { DataEdgeT, OpNodeT } from '../engine/types'
import { createFlow } from '../state/flows'
import { useStore } from '../state/store'
import { go } from '../router'

type Item = { id: string; state: 'run' | 'ok' | 'warn' | 'err' | 'info'; title: string; detail?: string[] }

const EXAMPLES = [
  'Cifra un texto con AES-CBC y descífralo para comprobar que vuelve igual',
  'Calcula SHA-256 y HMAC-SHA256 de un mensaje con una clave',
  'Codifica un texto en Base64 y luego en hexadecimal, y deshazlo',
]

/** Panel lateral derecho del asistente de flujos (como el asistente de IA de n8n). */
export default function AssistantPanel({ overlay }: { overlay?: boolean }) {
  const enabled = useAgentStore(s => s.enabled)
  const config = useAgentStore(s => s.config)
  const setOpen = useAgentStore(s => s.setAssistantOpen)
  const openSettings = useAgentStore(s => s.setSettingsOpen)
  const showToast = useStore(s => s.showToast)
  const [request, setRequest] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [progress, setProgress] = useState<{ text: string; progress: number } | null>(null)
  const [result, setResult] = useState<FlowResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const abort = useRef<AbortController | null>(null)
  // Flujo abierto: el asistente lo recibe como contexto y puede aplicar el resultado sobre él
  const flowName = useStore(s => s.flowName)
  const hasNodes = useStore(s => s.nodes.length > 0)
  const canUseCurrent = !overlay && hasNodes
  const [useCurrent, setUseCurrent] = useState(true)
  const base = useRef<CurrentFlow | null>(null)
  const [undo, setUndo] = useState<{ nodes: OpNodeT[]; edges: DataEdgeT[] } | null>(null)

  const push = (it: Item) => setItems(l => [...l, it])
  const settle = (state: Item['state'], title: string, detail?: string[]) =>
    setItems(l => { const i = l.map(x => x.state).lastIndexOf('run'); if (i < 0) return [...l, { id: crypto.randomUUID(), state, title, detail }]; const c = [...l]; c[i] = { ...c[i], state, title, detail }; return c })

  const onStep = (s: FlowStep) => {
    const id = crypto.randomUUID()
    switch (s.type) {
      case 'plan': push({ id, state: 'ok', title: `Planificar: ${s.ops.length} operaciones candidatas`, detail: [s.ops.join(' · ')] }); break
      case 'model': setProgress({ text: s.text, progress: s.progress }); break
      case 'build': setProgress(null); push({ id, state: 'run', title: s.retry ? 'Corregir el flujo según la validación' : s.round === 1 ? 'Construir el flujo' : `Construir de nuevo (vuelta ${s.round})` }); break
      case 'invalid': settle('warn', 'El flujo no pasó la validación', s.errors.slice(0, 4)); break
      case 'built': settle('ok', `Construido y validado: ${s.flow.blocks.length} bloques`); break
      case 'run': push({ id, state: 'run', title: 'Ejecutar en el motor de CyberChef' }); break
      case 'ran': {
        const bad = s.checks.filter(c => !c.ok)
        if (!s.failed.length && !bad.length) settle('ok', 'Todos los bloques funcionan', s.checks.map(c => `✓ ${c.description}`))
        else settle('warn', s.failed.length ? `${s.failed.length} bloque(s) fallaron` : 'Alguna comprobación no se cumple', [
          ...s.failed.map(k => `${k}: ${s.outcomes[k]?.err}`), ...bad.map(c => `✗ ${c.description}`)])
        break
      }
      case 'repair': push({ id, state: 'info', title: `Reparar con los errores reales (intento ${s.round + 1})` }); break
      case 'done': break
    }
  }

  const run = async (text = request) => {
    if (!text.trim() || running) return
    setRequest(text); setItems([]); setResult(null); setError(null); setProgress(null); setRunning(true); setUndo(null)
    abort.current = new AbortController()
    const st = useStore.getState()
    base.current = canUseCurrent && useCurrent ? describeCurrent(st.nodes, st.edges, st.results) : null
    try {
      const r = await runFlowAgent({ request: text.trim(), config, complete: completeLLM, catalog: catalog(), execute: executeFlow, onStep, signal: abort.current.signal, current: base.current ?? undefined })
      setResult(r)
      if (!r) setError('El modelo no produjo un flujo válido. Prueba a describirlo con más detalle o con otro modelo.')
    } catch (e: any) {
      setError(e?.name === 'AbortError' ? 'Cancelado.' : e?.message ?? String(e))
      setItems(l => l.map(x => (x.state === 'run' ? { ...x, state: 'err' } : x)))
    } finally { setRunning(false); setProgress(null) }
  }

  const accept = async () => {
    if (!result) return
    const { nodes, edges } = buildFlow(layoutFlow(result.flow))
    const f = await createFlow({ name: result.flow.title, origin: 'ai', graph: serializeGraph(nodes, edges) })
    setResult(null); setItems([]); setRequest('')
    go({ view: 'flow', id: f.id, tab: 'editor' })
    showToast('Flujo creado con IA')
  }

  /** Aplica el resultado sobre el flujo abierto (se guarda solo); se puede deshacer. */
  const applyHere = () => {
    if (!result || !base.current) return
    const st = useStore.getState()
    setUndo({ nodes: st.nodes, edges: st.edges })
    const g = applyToCanvas(result.flow, base.current)
    st.setGraph(g.nodes, g.edges)
    setResult(null); setItems([]); setRequest('')
    showToast('Cambios de la IA aplicados al flujo')
  }

  const Icon = ({ s }: { s: Item['state'] }) =>
    s === 'run' ? <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin text-muted" />
      : s === 'ok' ? <Check size={13} className="mt-0.5 shrink-0 text-green" />
      : s === 'warn' ? <AlertTriangle size={13} className="mt-0.5 shrink-0 text-yellow" />
      : s === 'err' ? <XCircle size={13} className="mt-0.5 shrink-0 text-red" />
      : <Sparkles size={13} className="mt-0.5 shrink-0 text-muted" />

  return (
    <aside
      aria-label="Asistente de flujos"
      className={`flex w-[min(100vw,360px)] shrink-0 flex-col border-l border-border bg-base ${overlay ? 'absolute inset-y-0 right-0 z-30 shadow-2xl' : 'absolute inset-y-0 right-0 z-30 md:static'}`}
    >
      <div className="flex h-11 items-center gap-2 border-b border-border px-3">
        <Sparkles size={14} className="text-green" />
        <h2 className="flex-1 text-[13px] font-bold">Asistente de flujos</h2>
        {enabled && <button className="text-[10.5px] uppercase tracking-wider text-muted hover:text-green" onClick={() => openSettings(true)} title="Ajustes de IA">{config.provider === 'groq' ? 'Groq' : 'Local'}</button>}
        <button className="btn btn-icon" onClick={() => setOpen(false)} aria-label="Cerrar el asistente"><X size={13} /></button>
      </div>

      {!enabled ? (
        <div className="space-y-3 p-4 text-[12.5px] leading-relaxed">
          <p>Describe el flujo que quieres y la IA lo construye, lo ejecuta en el motor real y lo repara hasta que funcione.</p>
          <p className="text-muted">Para usarlo, elige un proveedor: Groq (nube, con tu API key gratuita) o un modelo local en tu navegador.</p>
          <button className="btn btn-primary" onClick={() => openSettings(true)}><Settings size={12} /> Configurar la IA</button>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto p-3 text-[12.5px]">
            {!items.length && !running && !error && (
              <div className="space-y-2">
                <p className="text-muted">Describe el flujo en español. Por ejemplo:</p>
                {EXAMPLES.map(e => <button key={e} className="block w-full border border-border px-2.5 py-2 text-left text-[12px] hover:border-green/40 hover:text-green" onClick={() => run(e)}>{e}</button>)}
              </div>
            )}
            {request && (items.length > 0 || running) && <p className="rounded bg-surface px-2.5 py-2 text-[12px]">{request}</p>}
            {progress && (
              <div className="text-[11px] text-muted">
                <p className="truncate">{progress.text || 'Cargando el modelo local…'}</p>
                <div className="mt-1 h-1 bg-border"><div className="h-full bg-green" style={{ width: `${Math.round(progress.progress * 100)}%` }} /></div>
              </div>
            )}
            <ol className="space-y-1.5" aria-live="polite">
              {items.map(it => (
                <li key={it.id} className="flex gap-2">
                  <Icon s={it.state} />
                  <span className="min-w-0">
                    <span className="block">{it.title}</span>
                    {it.detail?.map((d, i) => <span key={i} className="block break-words text-[11px] text-muted">{d}</span>)}
                  </span>
                </li>
              ))}
            </ol>
            {error && <p className="rounded border border-red/40 bg-red/10 px-2.5 py-2 text-[12px] text-red">{error}</p>}
            {result && !running && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="font-bold">{result.flow.title}</p>
                <p className={`text-[11.5px] ${result.success ? 'text-green' : 'text-yellow'}`}>{result.success ? `Verificado en ${result.rounds} ${result.rounds === 1 ? 'intento' : 'intentos'}.` : 'Mejor intento: algunos bloques o comprobaciones fallan. Puedes abrirlo y corregirlo a mano.'}</p>
                <div className="flex flex-wrap gap-1">
                  {result.flow.blocks.map(b => {
                    const o = result.outcomes[b.key]
                    const expectedFail = result.flow.checks.some(c => c.block === b.key && c.fails)
                    const good = o?.ok || (expectedFail && !o?.ok)
                    return <span key={b.key} title={o?.ok ? o.text?.slice(0, 200) : o?.err} className={`border px-1.5 py-0.5 text-[10.5px] ${good ? 'border-green/40 text-green' : 'border-red/40 text-red'}`}>{b.op.startsWith('__') ? { __input: 'Entrada', __output: 'Salida', __xor2: 'XOR 2 flujos', __concat: 'Unir' }[b.op] : b.op}</span>
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 border-t border-border p-3">
            {result && !running && (
              <div className="flex gap-2">
                <button className="btn flex-1" onClick={() => { setResult(null); setItems([]) }}>Descartar</button>
                {base.current
                  ? <><button className="btn flex-1" onClick={accept} title="Guardarlo como un flujo aparte">Crear nuevo</button>
                    <button className="btn btn-primary flex-1" onClick={applyHere}>Aplicar aquí</button></>
                  : <button className="btn btn-primary flex-1" onClick={accept}>Abrir flujo</button>}
              </div>
            )}
            {undo && !running && !result && (
              <button className="btn w-full" onClick={() => { useStore.getState().setGraph(undo.nodes, undo.edges); setUndo(null); showToast('Cambios de la IA deshechos') }}>
                <Undo2 size={12} /> Deshacer los cambios de la IA
              </button>
            )}
            {canUseCurrent && (
              <label className="flex items-center gap-2 text-[11.5px] text-muted">
                <input type="checkbox" checked={useCurrent} onChange={e => setUseCurrent(e.target.checked)} disabled={running} />
                <span className="truncate">Trabajar sobre el flujo abierto{flowName ? ` «${flowName}»` : ''}</span>
              </label>
            )}
            <textarea
              className="field-input min-h-[70px] resize-y"
              placeholder={canUseCurrent && useCurrent ? 'Describe el flujo o qué cambiar en el abierto…' : 'Describe el flujo que quieres…'}
              value={request}
              onChange={e => setRequest(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) run() }}
              aria-label="Pedido para el asistente"
              disabled={running}
            />
            <div className="flex items-center gap-2">
              <span className="flex-1 text-[10.5px] text-muted">{config.provider === 'groq' ? 'Se envía a Groq' : 'Se procesa en tu equipo'} · Ctrl+Enter</span>
              {running
                ? <button className="btn" onClick={() => abort.current?.abort()}><Square size={11} /> Detener</button>
                : <button className="btn btn-primary" onClick={() => run()} disabled={!request.trim()}><Sparkles size={12} /> Generar</button>}
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
