import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Copy, Download, Eraser, History, Loader2, MoreHorizontal, RotateCcw, Sparkles, SquarePen, Trash2 } from 'lucide-react'
import { useAgentStore } from '../agent/config'
import { useStore } from '../state/store'
import { ORIGIN_LABEL, deleteFlow, duplicateFlow, isDraft, type FlowOrigin } from '../state/flows'
import { useExecutions } from '../state/recorder'
import { go } from '../router'

/** Barra superior de un flujo abierto, como la cabecera del editor de n8n. */
export default function FlowBar({ onExport, onReset }: { onExport: () => void; onReset: () => void }) {
  const mode = useStore(s => s.mode)
  const flowId = useStore(s => s.flowId)
  const name = useStore(s => s.flowName)
  const origin = useStore(s => s.flowOrigin)
  const save = useStore(s => s.saveState)
  const scope = useStore(s => s.execScope)
  const execs = useExecutions()
  const assistant = useAgentStore(s => s.assistantOpen)
  const setAssistant = useAgentStore(s => s.setAssistantOpen)
  const [editing, setEditing] = useState(false)
  const [menu, setMenu] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (editing) input.current?.select() }, [editing])
  useEffect(() => {
    if (!menu) return
    const f = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [menu])

  // Vista global de ejecuciones (sin flujo concreto)
  if (mode === 'executions' && scope === null) {
    return (
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <button className="btn btn-icon" onClick={() => go({ view: 'home' })} aria-label="Volver a Mis flujos" title="Mis flujos"><ArrowLeft size={14} /></button>
        <History size={14} className="text-green" />
        <span className="text-[13px] font-bold">Todas las ejecuciones</span>
        <span className="text-[11px] text-muted">de todos tus flujos</span>
      </div>
    )
  }
  const draft = isDraft({ flowId, flowOrigin: origin })
  if (!flowId && !draft) return null

  const count = execs.filter(e => e.flowId === flowId).length
  const commit = (v: string) => { setEditing(false); if (v.trim() && v.trim() !== name) useStore.getState().setFlowName(v.trim()) }
  const act = (f: () => void) => () => { setMenu(false); f() }
  const canReset = origin?.origin === 'lab' || origin?.origin === 'example'

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
      <button className="btn btn-icon shrink-0" onClick={() => go({ view: 'home' })} aria-label="Volver a Mis flujos" title="Mis flujos"><ArrowLeft size={14} /></button>
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        {editing ? (
          <input
            ref={input}
            className="field-input max-w-sm py-1 text-[13px] font-bold"
            defaultValue={name}
            aria-label="Nombre del flujo"
            onBlur={e => commit(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commit(e.currentTarget.value); if (e.key === 'Escape') setEditing(false) }}
          />
        ) : (
          <button className="truncate text-left text-[13.5px] font-bold hover:text-green" onClick={() => setEditing(true)} title="Renombrar">{name}</button>
        )}
        {origin && <span className="hidden shrink-0 border border-border px-1.5 text-[9.5px] uppercase tracking-wider text-muted sm:inline">{ORIGIN_LABEL[origin.origin as FlowOrigin] ?? origin.origin}</span>}
        <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted md:flex" aria-live="polite">
          {save === 'saving' ? <><Loader2 size={11} className="animate-spin" /> Guardando…</>
            : draft ? <span title="Se guarda en Mis flujos en cuanto lo modifiques">Sin guardar · se guarda al modificarlo</span>
            : <><Check size={11} className="text-green" /> Guardado</>}
        </span>
      </div>
      <div className="flex shrink-0" role="tablist" aria-label="Vista del flujo">
        <button role="tab" aria-selected={mode === 'editor'} className={`btn whitespace-nowrap ${mode === 'editor' ? 'btn-on' : ''}`} onClick={() => flowId && go({ view: 'flow', id: flowId, tab: 'editor' })}>
          <SquarePen size={13} /><span className="hidden sm:inline">Editor</span>
        </button>
        <button role="tab" aria-selected={mode === 'executions'} className={`btn -ml-px whitespace-nowrap ${mode === 'executions' ? 'btn-on' : ''}`} disabled={!flowId} title={flowId ? undefined : 'Aún no hay ejecuciones: el flujo se guarda al modificarlo'} onClick={() => flowId && go({ view: 'flow', id: flowId, tab: 'executions' })}>
          <History size={13} /><span className="hidden sm:inline">Ejecuciones</span>{count > 0 && <span className="text-[10.5px] opacity-80">{count}</span>}
        </button>
      </div>
      {mode === 'editor' && (
        <button className={`btn shrink-0 whitespace-nowrap ${assistant ? 'btn-on' : ''}`} onClick={() => setAssistant(!assistant)} aria-pressed={assistant} title="Asistente de flujos con IA">
          <Sparkles size={13} /><span className="hidden lg:inline">Asistente</span>
        </button>
      )}
      <div className="relative shrink-0" ref={menuRef}>
        <button className="btn btn-icon" onClick={() => setMenu(v => !v)} aria-label="Más acciones del flujo" aria-expanded={menu}><MoreHorizontal size={14} /></button>
        {menu && (
          <div className="absolute right-0 top-9 z-40 w-60 border border-border bg-surface py-1 text-[12.5px] shadow-lg" role="menu">
            <Item icon={<Download size={13} />} label="Exportar (JSON o receta)" onClick={act(onExport)} />
            {flowId && <Item icon={<Copy size={13} />} label="Duplicar" onClick={act(async () => { const c = await duplicateFlow(flowId); if (c) go({ view: 'flow', id: c.id, tab: 'editor' }) })} />}
            {canReset && <Item icon={<RotateCcw size={13} />} label={origin?.origin === 'lab' ? 'Reiniciar el laboratorio' : 'Reiniciar desde el ejemplo'} onClick={act(onReset)} />}
            <Item icon={<Eraser size={13} />} label="Vaciar el lienzo" disabled={mode !== 'editor'} onClick={act(() => { if (confirm('¿Borrar todos los bloques de este flujo?')) useStore.getState().setGraph([], []) })} />
            {flowId && <div className="my-1 border-t border-border" />}
            {flowId && <Item icon={<Trash2 size={13} />} label="Borrar el flujo" danger onClick={act(async () => {
              if (!confirm(`¿Borrar «${name}» y sus ${count} ejecuciones? No se puede deshacer.`)) return
              await deleteFlow(flowId)
              useStore.setState({ flowId: null })
              go({ view: 'home' }, true)
            })} />}
          </div>
        )}
      </div>
    </div>
  )
}

function Item({ icon, label, onClick, danger, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button role="menuitem" disabled={disabled} onClick={onClick} className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-elevated disabled:opacity-40 ${danger ? 'text-red' : ''}`}>
      <span className="text-muted">{icon}</span>{label}
    </button>
  )
}
