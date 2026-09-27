import { useEffect, useRef, useState } from 'react'
import { Cloud, Cpu, ExternalLink, Loader2, X } from 'lucide-react'
import { useAgentStore, DEFAULT_CONFIG } from '../agent/config'
import { GROQ_DEFAULT_MODEL, WEBLLM_MODELS, listGroqModels, webgpuAvailable, type AgentConfig } from '../agent/llm'

/** Ajustes de IA: proveedor (Groq en la nube o WebLLM local), key y modelo. Todo queda en este navegador. */
export default function AgentSettings() {
  const open = useAgentStore(s => s.settingsOpen)
  const setOpen = useAgentStore(s => s.setSettingsOpen)
  const saved = useAgentStore(s => s.config)
  const setConfig = useAgentStore(s => s.setConfig)
  const ref = useRef<HTMLDialogElement>(null)
  const [c, setC] = useState<AgentConfig>(saved)
  const [models, setModels] = useState<string[]>([])
  const [status, setStatus] = useState<{ kind: 'idle' | 'loading' | 'ok' | 'err'; msg?: string }>({ kind: 'idle' })
  const gpu = webgpuAvailable()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) { setC(saved); setModels([]); setStatus({ kind: 'idle' }); d.showModal() }
    if (!open && d.open) d.close()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const test = async () => {
    setStatus({ kind: 'loading' })
    try {
      const l = await listGroqModels(c.groqKey.trim())
      setModels(l)
      if (!l.includes(c.groqModel)) setC({ ...c, groqModel: l.includes(GROQ_DEFAULT_MODEL) ? GROQ_DEFAULT_MODEL : l[0] ?? c.groqModel })
      setStatus({ kind: 'ok', msg: `Key válida · ${l.length} modelos disponibles` })
    } catch (e: any) { setStatus({ kind: 'err', msg: e?.message ?? String(e) }) }
  }
  const save = () => { setConfig({ ...c, groqKey: c.groqKey.trim() }); setOpen(false) }
  const disable = () => { setConfig({ ...DEFAULT_CONFIG }); setOpen(false) }
  const canSave = c.provider === 'groq' ? c.groqKey.trim().length > 10 : gpu

  const Option = ({ id, icon, title, sub }: { id: AgentConfig['provider']; icon: React.ReactNode; title: string; sub: string }) => (
    <label className={`flex cursor-pointer gap-3 border p-3 ${c.provider === id ? 'border-green/60 bg-green/5' : 'border-border hover:border-green/30'}`}>
      <input type="radio" name="prov" className="mt-1 accent-[rgb(var(--c-green))]" checked={c.provider === id} onChange={() => setC({ ...c, provider: id })} />
      <span className="text-muted">{icon}</span>
      <span><span className="block text-[13px] font-bold text-text">{title}</span><span className="block text-[11.5px] text-muted">{sub}</span></span>
    </label>
  )

  return (
    <dialog ref={ref} onClose={() => setOpen(false)} className="w-[min(560px,94vw)] rounded-lg border border-border bg-surface p-0 text-text backdrop:bg-black/60" aria-labelledby="ia-title">
      <div className="flex items-center border-b border-border px-4 py-3">
        <h2 id="ia-title" className="label flex-1 text-text">Ajustes de IA</h2>
        <button className="btn btn-icon" onClick={() => setOpen(false)} aria-label="Cerrar"><X size={13} /></button>
      </div>
      <div className="space-y-3 p-4 text-[12.5px]">
        <p className="text-xs leading-relaxed text-muted">La IA es opcional: activa el asistente de flujos y el botón «Explicar». Todo funciona desde este navegador, sin servidor de CipherFlow.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Option id="groq" icon={<Cloud size={16} />} title="Groq (nube)" sub="Rápido y de buena calidad. Necesita una API key gratuita." />
          <Option id="webllm" icon={<Cpu size={16} />} title="Local (WebLLM)" sub={gpu ? 'El modelo corre en tu GPU; nada sale del equipo.' : 'Este navegador no tiene WebGPU.'} />
        </div>

        {c.provider === 'groq' ? (
          <div className="space-y-2">
            <label className="label block" htmlFor="ia-key">API key de Groq</label>
            <div className="flex gap-2">
              <input id="ia-key" className="field-input flex-1" type="password" autoComplete="off" spellCheck={false} placeholder="gsk_…" value={c.groqKey} onChange={e => { setC({ ...c, groqKey: e.target.value }); setStatus({ kind: 'idle' }) }} />
              <button className="btn" onClick={test} disabled={c.groqKey.trim().length < 10 || status.kind === 'loading'}>{status.kind === 'loading' ? <Loader2 size={12} className="animate-spin" /> : null} Probar</button>
            </div>
            {status.msg && <p className={`text-[11.5px] ${status.kind === 'err' ? 'text-red' : 'text-green'}`}>{status.msg}</p>}
            <a className="inline-flex items-center gap-1 text-[11.5px] text-green" href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Crear una key en console.groq.com <ExternalLink size={11} /></a>
            <label className="label block pt-1" htmlFor="ia-gmodel">Modelo</label>
            <select id="ia-gmodel" className="field-input" value={c.groqModel} onChange={e => setC({ ...c, groqModel: e.target.value })}>
              {(models.length ? models : [c.groqModel]).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <p className="rounded border border-yellow/35 bg-yellow/10 px-2.5 py-2 text-[11.5px] leading-relaxed">
              La key se guarda solo en este navegador. Al usar la IA, tu pedido y los datos del bloque o flujo se envían a la API de Groq. Para datos sensibles, usa el modo local.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="label block" htmlFor="ia-wmodel">Modelo local</label>
            <select id="ia-wmodel" className="field-input" value={c.webllmModel} onChange={e => setC({ ...c, webllmModel: e.target.value })} disabled={!gpu}>
              {WEBLLM_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <p className="text-[11.5px] leading-relaxed text-muted">
              La primera vez se descarga el modelo (se guarda en la caché del navegador). Los modelos pequeños son menos precisos: el asistente valida y repara lo que proponen, pero Groq suele dar mejores flujos.
            </p>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        <button className="btn hover:!border-red/50 hover:!text-red" onClick={disable}>Desactivar IA</button>
        <span className="flex-1" />
        <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={!canSave}>Guardar</button>
      </div>
    </dialog>
  )
}
