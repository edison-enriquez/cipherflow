import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { AlertTriangle, ArrowUp, Box, Check, ChevronRight, History, Loader2, Maximize2, Minimize2, Plus, Settings, Sparkles, Square, Trash2, Undo2, Workflow, X, XCircle } from 'lucide-react'
import { useAgentStore } from '../agent/config'
import { CLOUD, completeLLM, isCloud } from '../agent/llm'
import { runFlowAgent, type FlowStep } from '../agent/flowAgent'
import { layoutFlow, type AIFlow } from '../agent/flowSpec'
import { askAI } from '../agent/explain'
import { historyOf, routeIntent, threadTitle, type ChatMsg, type ChatThread, type TraceItem } from '../agent/chat'
import { partialFlow, planSteps } from '../agent/steps'
import { applyToCanvas, blockAskContext, catalog, currentAsFlow, describeCurrent, executeFlow, flowAskContext, sameBlock, type CurrentFlow } from '../agent/runtime'
import { opInfo } from '../engine/catalog'
import { buildFlow } from '../io'
import { serializeGraph } from '../state/runner'
import type { DataEdgeT, OpNodeT } from '../engine/types'
import { createFlow } from '../state/flows'
import { HOME, deleteThread, listThreads, newThread, saveThread } from '../state/chats'
import { useStore } from '../state/store'
import { go } from '../router'
import { highlight } from '../detail/ExplainCard'

type FlowMsg = Extract<ChatMsg, { role: 'flow' }>
const uid = () => crypto.randomUUID()

// Ancho del panel (escritorio): se arrastra por el borde izquierdo y se recuerda en este navegador
const WIDTH_KEY = 'cipherflow.asistente.ancho'
const MIN_W = 320, DEFAULT_W = 400
/** Máximo: el espacio que comparte con el lienzo (sin la paleta), dejando al lienzo al menos 440 px */
const maxWidth = (room = window.innerWidth) => Math.max(MIN_W, Math.min(1100, room - 440))
const savedWidth = () => { try { return Number(localStorage.getItem(WIDTH_KEY)) || DEFAULT_W } catch { return DEFAULT_W } }
const storeWidth = (w: number) => { try { localStorage.setItem(WIDTH_KEY, String(w)) } catch { /* sin almacenamiento */ } }
const COMMANDS = [
  ['/explicar', 'Explica el bloque adjunto o el flujo'],
  ['/arreglar', 'Corrige lo que falla y propone el cambio'],
  ['/preguntar', 'Responde sin cambiar el flujo'],
  ['/flujo', 'Construye o modifica el flujo'],
] as const

const blockLabel = (n: OpNodeT) => (n.data.op === '__output' && n.data.params?.label) || opInfo(n.data.op).name
const opLabel = (op: string) => ({ __input: 'Entrada', __output: 'Salida', __xor2: 'XOR de dos entradas', __concat: 'Unir' } as Record<string, string>)[op] ?? op

/** Panel del asistente: chat con historial por flujo, preguntas sobre bloques y propuestas paso a paso. */
export default function AssistantPanel({ overlay }: { overlay?: boolean }) {
  const enabled = useAgentStore(s => s.enabled)
  const config = useAgentStore(s => s.config)
  const setOpen = useAgentStore(s => s.setAssistantOpen)
  const openSettings = useAgentStore(s => s.setSettingsOpen)
  const askBlock = useAgentStore(s => s.askBlock)
  const askAbout = useAgentStore(s => s.askAbout)
  const showToast = useStore(s => s.showToast)
  const flowId = useStore(s => s.flowId)
  const flowName = useStore(s => s.flowName)
  const hasNodes = useStore(s => s.nodes.length > 0)
  const selected = useStore(s => s.nodes.find(n => n.selected))
  // En el editor se trabaja sobre el flujo abierto (aunque esté vacío); desde «Mis flujos» se crean flujos nuevos
  const canUseCurrent = !overlay
  const flowKey = canUseCurrent && flowId ? flowId : HOME

  const [thread, setThread] = useState<ChatThread>(() => newThread(flowKey))
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [text, setText] = useState('')
  const [useFlow, setUseFlow] = useState(true)
  const [live, setLive] = useState<{ trace: TraceItem[]; progress?: { text: string; progress: number }; label: string } | null>(null)
  const abort = useRef<AbortController | null>(null)
  /** Solo en memoria: flujo abierto al pedir (para aplicar pasos) y estado previo (para deshacer) */
  const bases = useRef(new Map<string, CurrentFlow>())
  const origs = useRef(new Map<string, CurrentFlow>())
  const undos = useRef(new Map<string, { nodes: OpNodeT[]; edges: DataEdgeT[] }>())
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const running = !!live
  const asideRef = useRef<HTMLElement>(null)
  /** Espacio que comparten el panel y el lienzo */
  const room = () => {
    const el = asideRef.current
    if (!el) return window.innerWidth
    // Superpuesto (Mis flujos, móvil): todo el ancho; al lado del lienzo: su ancho más el del lienzo (sin la paleta)
    if (getComputedStyle(el).position === 'absolute') return el.parentElement?.clientWidth ?? window.innerWidth
    return el.clientWidth + ((el.previousElementSibling as HTMLElement | null)?.clientWidth ?? 0)
  }
  const clampW = (w: number) => Math.round(Math.min(maxWidth(room()), Math.max(MIN_W, w)))
  const [width, setWidth] = useState(() => Math.max(MIN_W, Math.min(maxWidth(), savedWidth())))
  const widthRef = useRef(width)
  widthRef.current = width
  const [dragging, setDragging] = useState(false)
  const setW = (w: number) => { const v = clampW(w); widthRef.current = v; setWidth(v); storeWidth(v) }
  const wide = width >= maxWidth(room()) - 8
  useEffect(() => {
    const f = () => setWidth(w => clampW(w))
    f()
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  /** Arrastrar el borde izquierdo: hacia la izquierda, más ancho */
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault()
    const x0 = e.clientX, w0 = width
    setDragging(true)
    const move = (ev: PointerEvent) => setWidth(clampW(w0 + (x0 - ev.clientX)))
    const up = (ev: PointerEvent) => {
      setDragging(false); setW(w0 + (x0 - ev.clientX))
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // Hilo del flujo: el más reciente, o uno nuevo
  useEffect(() => {
    let alive = true
    abort.current?.abort()
    listThreads(flowKey).then(ts => { if (!alive) return; setThreads(ts); setThread(ts[0] ?? newThread(flowKey)) })
    return () => { alive = false }
  }, [flowKey])

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [thread.messages.length, live?.trace.length])
  useEffect(() => { if (askBlock) inputRef.current?.focus() }, [askBlock])

  /** Cambia los mensajes del hilo y lo guarda */
  const update = (fn: (m: ChatMsg[]) => ChatMsg[]) => setThread(th => {
    const messages = fn(th.messages)
    const next = { ...th, messages, title: threadTitle(messages), updated: Date.now() }
    saveThread(next).then(() => listThreads(flowKey).then(setThreads))
    return next
  })
  const patchMsg = (id: string, patch: Partial<FlowMsg>) => update(ms => ms.map(m => (m.id === id ? { ...m, ...patch } as ChatMsg : m)))

  const autosize = () => {
    const el = inputRef.current
    if (!el) return
    // Vacía: una línea (medirla al abrir el panel, aún sin su ancho final, la dejaría muy alta)
    if (!el.value) { el.style.height = ''; return }
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 220) + 'px'
  }
  useEffect(autosize, [text])
  // Si se midió sin su ancho final (panel abriéndose u oculto), se vuelve a medir al cambiar el ancho
  useEffect(() => {
    const el = inputRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let w = el.clientWidth
    const ro = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; autosize() } })
    ro.observe(el)
    return () => ro.disconnect()
  }, [enabled])

  const send = async (raw = text) => {
    if (!raw.trim() || running) return
    const block = askBlock && useStore.getState().nodes.some(n => n.id === askBlock.id) ? askBlock : null
    const intent = routeIntent(raw, !!block)
    if (!intent.text) return
    setText('')
    const prior = thread.messages
    update(ms => [...ms, { id: uid(), role: 'user', text: raw.trim(), block: block ?? undefined }])
    abort.current = new AbortController()
    const st = useStore.getState()
    const cur = canUseCurrent && useFlow ? describeCurrent(st.nodes, st.edges, st.results) : null
    try {
      if (intent.kind === 'ask') {
        setLive({ trace: [], label: block ? `Analizando «${block.label}»…` : 'Pensando…' })
        const ctx = block ? blockAskContext(block.id, st.nodes, st.edges, st.results)
          : cur && st.nodes.length ? flowAskContext(cur, st.flowName)
          : { subject: 'flujo' as const, label: '', context: 'No hay un flujo abierto.', corpus: '' }
        if (!ctx) throw new Error('Ese bloque ya no está en el lienzo.')
        const a = await askAI({ question: intent.text, subject: ctx.subject, context: ctx.context, corpus: ctx.corpus, history: historyOf(prior), config, complete: completeLLM, signal: abort.current.signal })
        update(ms => [...ms, a ? { id: uid(), role: 'answer', ...a } : { id: uid(), role: 'error', text: 'No se pudo obtener una respuesta fiable. Prueba a reformular la pregunta.' }])
      } else {
        await build(intent.text, block, cur)
      }
    } catch (e: any) {
      update(ms => [...ms, { id: uid(), role: 'error', text: e?.name === 'AbortError' ? 'Cancelado.' : e?.message ?? String(e) }])
    } finally { setLive(null) }
  }

  const build = async (request: string, block: { id: string; label: string } | null, cur: CurrentFlow | null) => {
    const trace: TraceItem[] = []
    const set = () => setLive(l => ({ label: 'Construyendo el flujo…', ...l, trace: [...trace] }))
    const push = (it: TraceItem) => { trace.push(it); set() }
    const settle = (it: TraceItem) => { trace[trace.length - 1] = it; set() }
    setLive({ trace: [], label: 'Construyendo el flujo…' })
    const onStep = (s: FlowStep) => {
      switch (s.type) {
        case 'plan': push({ state: 'ok', title: `Planificar: ${s.ops.length} operaciones candidatas`, detail: [s.ops.join(' · ')] }); break
        case 'model': setLive(l => l && { ...l, progress: { text: s.text, progress: s.progress } }); break
        case 'build': push({ state: 'info', title: s.retry ? 'Corregir según la validación' : s.round === 1 ? 'Construir el flujo' : `Construir de nuevo (vuelta ${s.round})` }); break
        case 'invalid': settle({ state: 'warn', title: 'No pasó la validación', detail: s.errors.slice(0, 4) }); break
        case 'built': settle({ state: 'ok', title: `Construido y validado: ${s.flow.blocks.length} bloques` }); break
        case 'run': push({ state: 'info', title: 'Ejecutar en el motor de CyberChef' }); break
        case 'ran': {
          const bad = s.checks.filter(c => !c.ok)
          settle(!s.failed.length && !bad.length
            ? { state: 'ok', title: 'Todos los bloques funcionan', detail: s.checks.map(c => `✓ ${c.description}`) }
            : { state: 'warn', title: s.failed.length ? `${s.failed.length} bloque(s) fallaron` : 'Alguna comprobación no se cumple', detail: [...s.failed.map(k => `${k}: ${s.outcomes[k]?.err}`), ...bad.map(c => `✗ ${c.description}`)] })
          break
        }
        case 'repair': push({ state: 'info', title: `Reparar con los errores reales (intento ${s.round + 1})` }); break
      }
    }
    const key = block && cur ? Object.entries(cur.ids).find(([, id]) => id === block.id)?.[0] : undefined
    const hasFlow = !!cur && useStore.getState().nodes.length > 0
    const r = await runFlowAgent({
      request: key ? `Sobre el bloque «${key}» (${block!.label}): ${request}` : request,
      config, complete: completeLLM, catalog: catalog(), execute: executeFlow, onStep, signal: abort.current!.signal,
      current: hasFlow ? cur! : undefined,
    })
    if (!r) { update(ms => [...ms, { id: uid(), role: 'error', text: 'El modelo no produjo un flujo válido. Prueba a describirlo con más detalle o con otro modelo.' }]); return }
    const before = hasFlow ? currentAsFlow(cur!) : null
    const target = cur ? 'current' : 'new'
    const id = uid()
    if (cur) { bases.current.set(id, cur); origs.current.set(id, cur) }
    const outcomes = Object.fromEntries(Object.entries(r.outcomes).map(([k, o]) => [k, o.ok ? { ok: true, text: o.text?.slice(0, 300) } : { ok: false, err: o.err }]))
    update(ms => [...ms, {
      id, role: 'flow', title: r.flow.title, success: r.success, rounds: r.rounds, flow: r.flow, outcomes, trace,
      target, before, steps: target === 'current' ? planSteps(r.flow, before, sameBlock) : [], applied: 0, status: 'pending',
    }])
  }

  /** Aplica los `n` primeros pasos de la propuesta sobre el lienzo */
  const applySteps = (m: FlowMsg, n: number) => {
    const cur = bases.current.get(m.id)
    if (!cur) return
    const st = useStore.getState()
    if (!undos.current.has(m.id)) undos.current.set(m.id, { nodes: st.nodes, edges: st.edges })
    const g = applyToCanvas(partialFlow(m.flow, m.before, m.steps, n), { ...cur, nodes: st.nodes })
    // Los bloques nuevos conservan su id en los pasos siguientes
    bases.current.set(m.id, { ...cur, ids: { ...cur.ids, ...g.ids } })
    st.setGraph(g.nodes, g.edges)
    patchMsg(m.id, { applied: n, status: n >= m.steps.length ? 'done' : 'pending' })
    if (n >= m.steps.length) showToast('Cambios de la IA aplicados al flujo')
  }

  const undo = (m: FlowMsg) => {
    const u = undos.current.get(m.id)
    if (!u) return
    useStore.getState().setGraph(u.nodes, u.edges)
    undos.current.delete(m.id)
    // La propuesta vuelve a quedar pendiente: se puede aplicar otra vez
    bases.current.set(m.id, origs.current.get(m.id)!)
    patchMsg(m.id, { applied: 0, status: 'pending' })
    showToast('Cambios de la IA deshechos')
  }

  const openAsNew = async (f: AIFlow) => {
    const { nodes, edges } = buildFlow(layoutFlow(f))
    const fl = await createFlow({ name: f.title, origin: 'ai', graph: serializeGraph(nodes, edges) })
    go({ view: 'flow', id: fl.id, tab: 'editor' })
    showToast('Flujo creado con IA')
  }

  const newChat = () => { abort.current?.abort(); setThread(newThread(flowKey)); setShowHistory(false); inputRef.current?.focus() }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() }
    if (e.key === 'Escape' && askBlock) askAbout(null)
  }

  const slash = text.startsWith('/') && !text.includes(' ') ? COMMANDS.filter(([c]) => c.startsWith(text.toLowerCase())) : []
  const suggestion = !askBlock && selected && canUseCurrent ? selected : null

  return (
    <aside
      ref={asideRef}
      aria-label="Asistente de flujos"
      style={{ '--asst-w': `${width}px` } as React.CSSProperties}
      className={`flex w-full shrink-0 flex-col border-l border-border bg-base md:w-[var(--asst-w)] ${dragging ? 'select-none' : ''} ${overlay ? 'absolute inset-y-0 right-0 z-30 shadow-2xl' : 'absolute inset-y-0 right-0 z-30 md:relative'}`}
    >
      <div
        role="separator" aria-orientation="vertical" aria-label="Ancho del asistente" tabIndex={0}
        aria-valuemin={MIN_W} aria-valuemax={maxWidth(room())} aria-valuenow={width}
        title="Arrastra para cambiar el ancho · doble clic para restaurarlo"
        className={`absolute inset-y-0 -left-1 z-20 hidden w-2 cursor-col-resize md:block ${dragging ? 'bg-green/40' : 'hover:bg-green/25 focus-visible:bg-green/25'}`}
        onPointerDown={startDrag}
        onDoubleClick={() => setW(DEFAULT_W)}
        onKeyDown={e => { if (e.key === 'ArrowLeft') { e.preventDefault(); setW(widthRef.current + 32) } if (e.key === 'ArrowRight') { e.preventDefault(); setW(widthRef.current - 32) } }}
      />
      <div className="relative flex h-11 items-center gap-1 border-b border-border px-3">
        <Sparkles size={14} className="text-green" />
        <h2 className="ml-1 flex-1 truncate text-[13px] font-bold" title={thread.title}>{thread.messages.length ? thread.title : 'Asistente'}</h2>
        {enabled && <button className="px-1 text-[10.5px] uppercase tracking-wider text-muted hover:text-green" onClick={() => openSettings(true)} title="Ajustes de IA">{{ groq: 'Groq', openrouter: 'OpenRouter', qwen: 'Qwen', webllm: 'GPU', webnn: 'NPU' }[config.provider]}</button>}
        {enabled && <>
          <button className="btn btn-icon" onClick={() => setShowHistory(v => !v)} aria-label="Historial de conversaciones" title="Historial"><History size={13} /></button>
          <button className="btn btn-icon" onClick={newChat} aria-label="Conversación nueva" title="Conversación nueva"><Plus size={13} /></button>
        </>}
        <button className="btn btn-icon hidden md:inline-flex" onClick={() => setW(wide ? DEFAULT_W : maxWidth(room()))} aria-label={wide ? 'Reducir el asistente' : 'Ampliar el asistente'} title={wide ? 'Reducir' : 'Ampliar'}>
          {wide ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
        <button className="btn btn-icon" onClick={() => setOpen(false)} aria-label="Cerrar el asistente"><X size={13} /></button>
        {showHistory && (
          <div className="absolute right-2 top-10 z-10 max-h-[60vh] w-[300px] overflow-y-auto border border-border bg-surface p-1 shadow-xl">
            <p className="px-2 py-1 text-[10.5px] uppercase tracking-wider text-muted">{flowKey === HOME ? 'Conversaciones' : `Conversaciones de «${flowName}»`}</p>
            {!threads.length && <p className="px-2 py-2 text-[12px] text-muted">Aún no hay conversaciones guardadas.</p>}
            {threads.map(t => (
              <div key={t.id} className={`group flex items-center gap-1 px-2 py-1.5 text-[12px] hover:bg-base ${t.id === thread.id ? 'text-green' : ''}`}>
                <button className="min-w-0 flex-1 truncate text-left" onClick={() => { setThread(t); setShowHistory(false) }}>{t.title}</button>
                <span className="text-[10px] text-muted">{new Date(t.updated).toLocaleDateString()}</span>
                <button className="text-muted opacity-0 hover:text-red group-hover:opacity-100" aria-label="Borrar conversación" onClick={async () => { await deleteThread(t.id); const ts = await listThreads(flowKey); setThreads(ts); if (t.id === thread.id) setThread(ts[0] ?? newThread(flowKey)) }}><Trash2 size={11} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {!enabled ? (
        <div className="space-y-3 p-4 text-[12.5px] leading-relaxed">
          <p>Pregúntale a la IA por un bloque o por el flujo, o describe el flujo que quieres: lo construye, lo ejecuta en el motor real y lo repara hasta que funcione.</p>
          <p className="text-muted">Para usarlo, elige un proveedor en la nube (Groq u OpenRouter) y pega tu API key.</p>
          <button className="btn btn-primary" onClick={() => openSettings(true)}><Settings size={12} /> Configurar la IA</button>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto p-3 text-[12.5px]" aria-live="polite">
            {!thread.messages.length && !running && (
              <div className="space-y-1.5 pt-2 text-[12px] text-muted">
                <p>Pregunta por un bloque o por el flujo, o describe lo que quieres construir.</p>
                <p className="text-[11px]">Con el botón <Sparkles size={10} className="inline" /> de un bloque le preguntas sobre ese bloque. Escribe <span className="text-green">/</span> para ver los comandos.</p>
              </div>
            )}
            {thread.messages.map(m => <Message key={m.id} m={m} running={running} canApply={bases.current.has(m.id)} canUndo={undos.current.has(m.id)}
              onFollow={send} onSteps={applySteps} onUndo={undo} onOpen={openAsNew} onDiscard={x => patchMsg(x.id, { status: 'discarded' })} />)}
            {live && (
              <div className="space-y-1.5">
                <p className="flex items-center gap-2 text-muted"><Loader2 size={13} className="animate-spin" /> {live.label}</p>
                <Trace items={live.trace} open />
                {live.progress && (
                  <div className="text-[11px] text-muted">
                    <p className="truncate" title={live.progress.text}>{live.progress.text}</p>
                    <div className="mt-1 h-1 bg-border"><div className="h-full bg-green" style={{ width: `${Math.round(live.progress.progress * 100)}%` }} /></div>
                  </div>
                )}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-border p-2.5">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
              {canUseCurrent && (
                <button className={`inline-flex max-w-[180px] items-center gap-1 border px-1.5 py-0.5 ${useFlow ? 'border-green/40 text-green' : 'border-border text-muted line-through'}`}
                  onClick={() => setUseFlow(v => !v)} title={useFlow ? 'La IA ve y puede cambiar el flujo abierto. Clic para no usarlo.' : 'Clic para trabajar sobre el flujo abierto'}>
                  <Workflow size={11} /> <span className="truncate">{hasNodes ? flowName : 'Flujo vacío'}</span>
                </button>
              )}
              {askBlock && (
                <span className="inline-flex max-w-[180px] items-center gap-1 border border-purple/40 px-1.5 py-0.5 text-purple">
                  <Box size={11} /> <span className="truncate">{askBlock.label}</span>
                  <button onClick={() => askAbout(null)} aria-label="Quitar el bloque del contexto"><X size={10} /></button>
                </span>
              )}
              {suggestion && (
                <button className="inline-flex max-w-[180px] items-center gap-1 border border-dashed border-border px-1.5 py-0.5 text-muted hover:text-purple" onClick={() => askAbout({ id: suggestion.id, label: blockLabel(suggestion) })} title="Adjuntar el bloque seleccionado">
                  <Plus size={10} /> <span className="truncate">{blockLabel(suggestion)}</span>
                </button>
              )}
            </div>
            {slash.length > 0 && (
              <div className="mb-1.5 border border-border bg-surface">
                {slash.map(([c, d]) => <button key={c} className="flex w-full gap-2 px-2 py-1 text-left text-[11.5px] hover:bg-base" onClick={() => { setText(c + ' '); inputRef.current?.focus() }}><span className="text-green">{c}</span><span className="text-muted">{d}</span></button>)}
              </div>
            )}
            <div className="flex items-end gap-1.5 border border-border bg-surface px-2 py-1.5 focus-within:border-green/50">
              <textarea
                ref={inputRef}
                rows={1}
                className="max-h-[220px] min-h-[22px] flex-1 resize-none bg-transparent text-[12.5px] leading-snug outline-none placeholder:text-muted"
                placeholder={askBlock ? 'Pregunta o pide un cambio en este bloque…' : canUseCurrent && useFlow ? 'Pregunta o pide un cambio… (/ comandos)' : 'Describe el flujo que quieres…'}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={onKey}
                aria-label="Mensaje para el asistente"
              />
              {running
                ? <button className="btn btn-icon" onClick={() => abort.current?.abort()} aria-label="Detener" title="Detener"><Square size={11} /></button>
                : <button className="btn btn-icon btn-primary" onClick={() => send()} disabled={!text.trim()} aria-label="Enviar" title="Enviar (Enter)"><ArrowUp size={13} /></button>}
            </div>
            <p className="mt-1 truncate text-[10.5px] text-muted">{isCloud(config.provider) ? `Se envía a ${CLOUD[config.provider].name}` : 'Se procesa en tu equipo'} · Enter envía · Shift+Enter salto de línea</p>
          </div>
        </>
      )}
    </aside>
  )
}

function StateIcon({ s }: { s: TraceItem['state'] }) {
  return s === 'ok' ? <Check size={12} className="mt-0.5 shrink-0 text-green" />
    : s === 'warn' ? <AlertTriangle size={12} className="mt-0.5 shrink-0 text-yellow" />
    : s === 'err' ? <XCircle size={12} className="mt-0.5 shrink-0 text-red" />
    : <ChevronRight size={12} className="mt-0.5 shrink-0 text-muted" />
}

/** Pasos internos del agente (planificar, validar, ejecutar, reparar), plegables */
function Trace({ items, open }: { items: TraceItem[]; open?: boolean }) {
  if (!items.length) return null
  const list = (
    <ol className="space-y-1">
      {items.map((it, i) => (
        <li key={i} className="flex gap-1.5 text-[11.5px]">
          <StateIcon s={it.state} />
          <span className="min-w-0"><span className="block">{it.title}</span>{it.detail?.map((d, j) => <span key={j} className="block break-words text-[10.5px] text-muted">{d}</span>)}</span>
        </li>
      ))}
    </ol>
  )
  if (open) return list
  return (
    <details className="text-muted">
      <summary className="cursor-pointer text-[11px] hover:text-text">{items.length} pasos del agente</summary>
      <div className="mt-1.5 text-text">{list}</div>
    </details>
  )
}

interface MsgProps {
  m: ChatMsg
  running: boolean
  canApply: boolean
  canUndo: boolean
  onFollow: (t: string) => void
  onSteps: (m: FlowMsg, n: number) => void
  onUndo: (m: FlowMsg) => void
  onOpen: (f: AIFlow) => void
  onDiscard: (m: FlowMsg) => void
}

function Message({ m, running, canApply, canUndo, onFollow, onSteps, onUndo, onOpen, onDiscard }: MsgProps) {
  if (m.role === 'user') return (
    <div className="ml-8 rounded bg-surface px-2.5 py-2">
      {m.block && <p className="mb-0.5 flex items-center gap-1 text-[10.5px] text-purple"><Box size={10} /> {m.block.label}</p>}
      <p className="whitespace-pre-wrap break-words">{m.text}</p>
    </div>
  )
  if (m.role === 'error') return <p className="rounded border border-red/40 bg-red/10 px-2.5 py-2 text-[12px] text-red">{m.text}</p>
  if (m.role === 'answer') return (
    <div className="space-y-1.5">
      <p className="leading-relaxed">{highlight(m.text, m.citations, m.rejected)}</p>
      {m.rejected.length > 0 && <p className="text-[10.5px] text-muted">Tachado: valores que la IA mencionó pero no aparecen en los datos reales.</p>}
      {m.followups.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {m.followups.map(f => <button key={f} disabled={running} className="border border-border px-2 py-0.5 text-left text-[11px] hover:border-green/40 hover:text-green" onClick={() => onFollow(f)}>{f}</button>)}
        </div>
      )}
    </div>
  )
  return <FlowCard m={m} running={running} canApply={canApply} canUndo={canUndo} onSteps={onSteps} onUndo={onUndo} onOpen={onOpen} onDiscard={onDiscard} />
}

function FlowCard({ m, running, canApply, canUndo, onSteps, onUndo, onOpen, onDiscard }: Omit<MsgProps, 'onFollow'> & { m: FlowMsg }) {
  const byKey = useMemo(() => new Map(m.flow.blocks.map(b => [b.key, b])), [m.flow])
  const expectedFail = new Set(m.flow.checks.filter(c => c.fails).map(c => c.block))
  const good = (k: string) => { const o = m.outcomes[k]; return o?.ok || (expectedFail.has(k) && !o?.ok) }
  const active = m.status === 'pending' && !running
  const stepLabel = (k: string, op: string) => {
    const b = byKey.get(k)
    return b?.op === '__output' && b.params?.label ? `Salida «${b.params.label}»` : opLabel(op)
  }
  return (
    <div className="space-y-2 border border-border p-2.5">
      <div className="flex items-start gap-2">
        <p className="flex-1 font-bold">{m.title}</p>
        <span className={`shrink-0 text-[10.5px] ${m.success ? 'text-green' : 'text-yellow'}`}>{m.success ? `✓ verificado${m.rounds > 1 ? ` (${m.rounds} intentos)` : ''}` : 'mejor intento'}</span>
      </div>
      {!m.success && <p className="text-[11px] text-yellow">Algunos bloques o comprobaciones fallan; puedes aplicarlo y corregirlo a mano.</p>}
      <Trace items={m.trace} />

      {m.target === 'current' && m.steps.length > 0 ? (
        <ol className="space-y-1">
          {m.steps.map((s, i) => {
            const done = i < m.applied
            const next = i === m.applied && m.status === 'pending'
            const o = m.outcomes[s.key]
            return (
              <li key={s.key + s.kind} className={`flex items-start gap-1.5 text-[11.5px] ${m.status === 'discarded' ? 'text-muted line-through' : ''}`}>
                {done ? <Check size={12} className="mt-0.5 shrink-0 text-green" /> : <span className={`mt-[3px] h-2.5 w-2.5 shrink-0 rounded-full border ${next ? 'border-green' : 'border-border'}`} />}
                <span className="min-w-0 flex-1">
                  <span>{i + 1}. {s.kind === 'add' ? 'Añadir' : s.kind === 'change' ? 'Cambiar' : 'Quitar'} {stepLabel(s.key, s.op)}</span>
                  {s.kind !== 'remove' && o && <span className={`block truncate text-[10.5px] ${good(s.key) ? 'text-muted' : 'text-red'}`} title={o.ok ? o.text : o.err}>{o.ok ? `→ ${o.text || '(vacío)'}` : `✗ ${o.err}`}</span>}
                </span>
                {next && active && canApply && <button className="shrink-0 text-[10.5px] text-green hover:underline" onClick={() => onSteps(m, i + 1)}>Aplicar</button>}
              </li>
            )
          })}
        </ol>
      ) : m.target === 'current' ? (
        <p className="text-[11.5px] text-muted">La propuesta no cambia nada del flujo abierto.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {m.flow.blocks.map(b => <span key={b.key} title={m.outcomes[b.key]?.ok ? m.outcomes[b.key].text : m.outcomes[b.key]?.err} className={`border px-1.5 py-0.5 text-[10.5px] ${good(b.key) ? 'border-green/40 text-green' : 'border-red/40 text-red'}`}>{opLabel(b.op)}</span>)}
        </div>
      )}

      {active && m.target === 'current' && m.steps.length > 0 && !canApply && (
        <p className="text-[11px] text-muted">Esta propuesta es de una sesión anterior: ya no se puede aplicar por pasos. Ábrela como flujo nuevo o pídela de nuevo.</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {active && m.target === 'current' && canApply && m.applied < m.steps.length && <>
          <button className="btn btn-primary" onClick={() => onSteps(m, m.applied + 1)}>Siguiente paso</button>
          <button className="btn" onClick={() => onSteps(m, m.steps.length)}>Aplicar todo</button>
        </>}
        {active && m.target === 'new' && <button className="btn btn-primary" onClick={() => onOpen(m.flow)}>Abrir flujo</button>}
        {active && m.target === 'current' && <button className="btn" onClick={() => onOpen(m.flow)} title="Guardarlo como un flujo aparte">Crear nuevo</button>}
        {active && m.applied === 0 && <button className="btn" onClick={() => onDiscard(m)}>Descartar</button>}
        {canUndo && m.applied > 0 && !running && <button className="btn" onClick={() => onUndo(m)}><Undo2 size={12} /> Deshacer</button>}
      </div>
      {m.status === 'done' && <p className="text-[11px] text-green">Aplicado al flujo.</p>}
      {m.status === 'discarded' && <p className="text-[11px] text-muted">Descartado.</p>}
    </div>
  )
}
