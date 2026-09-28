import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, CircuitBoard, Cloud, Copy, Cpu, ExternalLink, Eye, EyeOff, Loader2, Lock, Terminal, X } from 'lucide-react'
import { useAgentStore, DEFAULT_CONFIG } from '../agent/config'
import { OPENCODE_DEFAULT_MODEL, OPENCODE_DEFAULT_URL, installCommand, listOpenCodeFreeModels, newPassword, serveCommand, type Runner, type Shell } from '../agent/opencode'

const PREFS_KEY = 'cipherflow.opencode.preferencias'
function readPref<T extends string>(k: 'shell' | 'runner', def: T): T { try { return (JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')[k] as T) || def } catch { return def } }
function writePref(k: 'shell' | 'runner', v: string) { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'), [k]: v })) } catch { /* sin almacenamiento */ } }
import { CLOUD, LOCAL_PROVIDERS, VISIBLE_CLOUD, WEBLLM_MODELS, WEBNN_MODELS, cloudKey, cloudModel, isCloud, listCloudModels, OPENROUTER_AUTO, probeWebNN, webgpuAvailable, webnnAvailable, type AgentConfig, type CloudProvider, type WebNNDevice } from '../agent/llm'

/** Cómo se presenta cada proveedor: etiquetas cortas, una frase y qué implica su cuenta gratuita */
const INFO: Record<AgentConfig['provider'], { tags: string[]; desc: string; limits?: string }> = {
  groq: { tags: ['Gratis', 'Rápido'], desc: 'Modelos abiertos (Llama, Qwen…) con respuestas muy rápidas.', limits: 'Cuenta gratuita con límites por minuto y por día según el modelo.' },
  openrouter: { tags: ['Solo gratuitos', 'Rota modelos'], desc: 'Decenas de modelos gratuitos; si uno falla, pasa al siguiente.', limits: 'Sin saldo: 20 peticiones por minuto y 50 al día, para todos los modelos gratuitos juntos.' },
  qwen: { tags: ['API oficial'], desc: 'Modelos Qwen desde Alibaba Model Studio.' },
  webllm: { tags: ['Local', 'Privado'], desc: 'Modelo en tu GPU con WebGPU; nada sale del equipo.' },
  webnn: { tags: ['Local', 'NPU'], desc: 'Modelo en la NPU con WebNN; sin límites de uso.' },
  opencode: { tags: ['Gratis', 'Sin key'], desc: 'Modelos gratuitos de OpenCode Zen a través de OpenCode en tu equipo.' },
}
const NAME: Record<AgentConfig['provider'], string> = { groq: 'Groq', openrouter: 'OpenRouter', qwen: 'Qwen (Alibaba)', webllm: 'GPU (WebLLM)', webnn: 'NPU (WebNN)', opencode: 'OpenCode (local)' }

/** Ajustes de IA: proveedor (en la nube: Groq u OpenRouter; ocultos: Alibaba y, en local, WebLLM en la GPU o WebNN en la NPU), key y modelo. Todo queda en este navegador. */
export default function AgentSettings() {
  const open = useAgentStore(s => s.settingsOpen)
  const setOpen = useAgentStore(s => s.setSettingsOpen)
  const saved = useAgentStore(s => s.config)
  const enabled = useAgentStore(s => s.enabled)
  const setConfig = useAgentStore(s => s.setConfig)
  const ref = useRef<HTMLDialogElement>(null)
  const [c, setC] = useState<AgentConfig>(saved)
  const [models, setModels] = useState<string[]>([])
  const [status, setStatus] = useState<{ kind: 'idle' | 'loading' | 'ok' | 'err'; msg?: string }>({ kind: 'idle' })
  const [reveal, setReveal] = useState(false)
  const gpu = webgpuAvailable()
  const nn = webnnAvailable()
  // Qué dispositivos WebNN acepta este equipo (se comprueba al abrir los ajustes)
  const [devices, setDevices] = useState<Record<WebNNDevice, boolean | null>>({ npu: null, gpu: null })
  useEffect(() => {
    if (!open || !nn || !LOCAL_PROVIDERS) return
    Promise.all([probeWebNN('npu'), probeWebNN('gpu')]).then(([npu, gpu]) => setDevices({ npu, gpu }))
  }, [open, nn])

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) { setC(saved); setModels([]); setStatus({ kind: 'idle' }); setReveal(false); d.showModal() }
    if (!open && d.open) d.close()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Proveedor en la nube: cada uno guarda su propia key y modelo
  const cloud = isCloud(c.provider) ? c.provider : null
  const keyField = (p: CloudProvider): 'groqKey' | 'openrouterKey' | 'qwenKey' => (p === 'groq' ? 'groqKey' : p === 'openrouter' ? 'openrouterKey' : 'qwenKey')
  const modelField = (p: CloudProvider): 'groqModel' | 'openrouterModel' | 'qwenModel' => (p === 'groq' ? 'groqModel' : p === 'openrouter' ? 'openrouterModel' : 'qwenModel')
  // OpenCode: la contraseña del servidor se genera aquí y va en el comando de arranque
  const pick = (provider: AgentConfig['provider']) => {
    setC({ ...c, provider, ...(provider === 'opencode' && !c.opencodePassword ? { opencodePassword: newPassword() } : {}) })
    setModels([]); setStatus({ kind: 'idle' }); setReveal(false)
  }
  // Terminal y forma de ejecutar OpenCode: se recuerdan en este navegador
  const [shell, setShellState] = useState<Shell>(() => readPref('shell', /Win/.test(navigator.platform) ? 'powershell' : 'bash'))
  const [runner, setRunnerState] = useState<Runner>(() => readPref('runner', 'npx'))
  const setShell = (v: Shell) => { setShellState(v); writePref('shell', v); setCopied(null) }
  const setRunner = (v: Runner) => { setRunnerState(v); writePref('runner', v); setCopied(null) }
  const [copied, setCopied] = useState<'serve' | 'install' | null>(null)
  const [copyFailed, setCopyFailed] = useState(false)
  const cmdRef = useRef<HTMLPreElement>(null)
  /** Copia con la API del portapapeles; si el navegador la bloquea, con execCommand dentro del diálogo;
   *  y si tampoco, deja el comando seleccionado para copiarlo con Ctrl+C. */
  const copy = async (what: 'serve' | 'install', text: string) => {
    setCopyFailed(false)
    let ok = false
    try { await navigator.clipboard.writeText(text); ok = true } catch {
      const ta = document.createElement('textarea')
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
      ;(ref.current ?? document.body).appendChild(ta)
      ta.select()
      try { ok = document.execCommand('copy') } catch { ok = false }
      ta.remove()
    }
    if (ok) { setCopied(what); return }
    setCopied(null); setCopyFailed(true)
    if (what === 'serve' && cmdRef.current) { const r = document.createRange(); r.selectNodeContents(cmdRef.current); const s = getSelection(); s?.removeAllRanges(); s?.addRange(r) }
  }
  const ocUrl = c.opencodeUrl || OPENCODE_DEFAULT_URL
  const ocCommand = serveCommand({ shell, runner, password: c.opencodePassword ?? '', origin: location.origin, url: ocUrl })
  const testOpenCode = async () => {
    setStatus({ kind: 'loading' })
    try {
      const l = await listOpenCodeFreeModels({ url: ocUrl, password: c.opencodePassword ?? '' })
      setModels(l)
      if (!l.includes(c.opencodeModel ?? OPENCODE_DEFAULT_MODEL)) setC({ ...c, opencodeModel: l[0] })
      setStatus({ kind: 'ok', msg: `Conectado · ${l.length} modelos gratuitos` })
    } catch (e: any) { setStatus({ kind: 'err', msg: e?.message ?? String(e) }) }
  }
  const hasKey = (p: CloudProvider) => cloudKey(saved, p).trim().length > 10

  const test = async () => {
    if (!cloud) return
    setStatus({ kind: 'loading' })
    try {
      const l = await listCloudModels(cloud, cloudKey(c).trim())
      setModels(l)
      const cur = cloudModel(c)
      if (!l.includes(cur)) setC({ ...c, [modelField(cloud)]: l.includes(CLOUD[cloud].defaultModel) ? CLOUD[cloud].defaultModel : l[0] ?? cur })
      setStatus({ kind: 'ok', msg: `Key válida · ${cloud === 'openrouter' ? l.length - 1 : l.length} modelos disponibles` })
    } catch (e: any) { setStatus({ kind: 'err', msg: e?.message ?? String(e) }) }
  }
  const save = () => { setConfig(cloud ? { ...c, [keyField(cloud)]: cloudKey(c).trim() } : c); setOpen(false) }
  const disable = () => { setConfig({ ...DEFAULT_CONFIG }); setOpen(false) }
  const canSave = cloud ? cloudKey(c).trim().length > 10 : c.provider === 'opencode' ? (c.opencodePassword ?? '').length >= 8 : c.provider === 'webnn' ? nn : gpu

  const options: { id: AgentConfig['provider']; icon: ReactNode; off?: string }[] = [
    ...VISIBLE_CLOUD.map(id => ({ id, icon: <Cloud size={15} /> })),
    { id: 'opencode' as const, icon: <Terminal size={15} /> },
    ...(LOCAL_PROVIDERS ? [
      { id: 'webllm' as const, icon: <Cpu size={15} />, off: gpu ? undefined : 'Este navegador no tiene WebGPU.' },
      { id: 'webnn' as const, icon: <CircuitBoard size={15} />, off: nn ? undefined : 'Requiere activar WebNN en el navegador.' },
    ] : []),
  ]
  const model = cloud ? cloudModel(c) : ''

  return (
    <dialog ref={ref} onClose={() => setOpen(false)} className="w-[min(580px,94vw)] rounded-lg border border-border bg-surface p-0 text-text backdrop:bg-black/60" aria-labelledby="ia-title">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <h2 id="ia-title" className="label text-text">Ajustes de IA</h2>
        <span className={`inline-flex items-center gap-1.5 text-[11px] ${enabled ? 'text-green' : 'text-muted'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${enabled ? 'bg-green' : 'bg-muted'}`} />
          {enabled ? `Activa con ${NAME[saved.provider]}` : 'Desactivada'}
        </span>
        <span className="flex-1" />
        <button className="btn btn-icon" onClick={() => setOpen(false)} aria-label="Cerrar"><X size={13} /></button>
      </div>

      <div className="space-y-4 p-4 text-[12.5px]">
        <p className="text-[11.5px] leading-relaxed text-muted">Opcional: activa el asistente de flujos, las preguntas sobre bloques y «Explicar». Todo funciona desde este navegador, sin servidor de CipherFlow.</p>

        <fieldset>
          <legend className="label mb-2">Proveedor</legend>
          <div role="radiogroup" className={`grid gap-2 ${options.length === 1 ? '' : options.length === 2 || options.length === 4 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
            {options.map(o => {
              const on = c.provider === o.id
              const inf = INFO[o.id]
              return (
                <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => pick(o.id)}
                  className={`relative flex flex-col gap-1.5 border p-3 text-left transition-colors ${on ? 'border-green/70 bg-green/5' : 'border-border hover:border-green/30'} ${o.off ? 'opacity-60' : ''}`}>
                  <span className="flex items-center gap-2">
                    <span className={on ? 'text-green' : 'text-muted'}>{o.icon}</span>
                    <span className="flex-1 text-[13px] font-bold">{NAME[o.id]}</span>
                    {on && <Check size={14} className="text-green" />}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {inf.tags.map(t => <span key={t} className="border border-border px-1.5 text-[10px] uppercase tracking-wider text-muted">{t}</span>)}
                  </span>
                  <span className="text-[11.5px] leading-snug text-muted">{o.off ?? inf.desc}</span>
                  {isCloud(o.id) && hasKey(o.id) && <span className="text-[10.5px] text-green">✓ Key guardada</span>}
                </button>
              )
            })}
          </div>
        </fieldset>

        {cloud ? (
          <div className="space-y-3 border-t border-border pt-4">
            <Step n={1} title={`Consigue una API key de ${CLOUD[cloud].name}`}>
              <a className="btn inline-flex" href={CLOUD[cloud].keyUrl} target="_blank" rel="noreferrer">Abrir {new URL(CLOUD[cloud].keyUrl).hostname} <ExternalLink size={11} /></a>
              {INFO[cloud].limits && <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{INFO[cloud].limits}</p>}
            </Step>

            <Step n={2} title="Pégala y pruébala" htmlFor="ia-key">
              <div className="flex gap-2">
                <div className="flex min-w-0 flex-1 items-center border border-border bg-base focus-within:border-green/50">
                  <input id="ia-key" className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 font-mono text-[12px] outline-none placeholder:text-muted" type={reveal ? 'text' : 'password'} autoComplete="off" spellCheck={false}
                    placeholder={CLOUD[cloud].keyHint} value={cloudKey(c)} onChange={e => { setC({ ...c, [keyField(cloud)]: e.target.value }); setStatus({ kind: 'idle' }) }}
                    onKeyDown={e => { if (e.key === 'Enter' && cloudKey(c).trim().length >= 10) test() }} />
                  <button type="button" className="px-2 text-muted hover:text-text" onClick={() => setReveal(v => !v)} aria-label={reveal ? 'Ocultar la key' : 'Mostrar la key'} title={reveal ? 'Ocultar' : 'Mostrar'}>
                    {reveal ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <button className="btn shrink-0" onClick={test} disabled={cloudKey(c).trim().length < 10 || status.kind === 'loading'}>
                  {status.kind === 'loading' ? <Loader2 size={12} className="animate-spin" /> : status.kind === 'ok' ? <Check size={12} /> : null} Probar
                </button>
              </div>
              {status.msg && <p role="status" className={`mt-1.5 text-[11.5px] ${status.kind === 'err' ? 'text-red' : 'text-green'}`}>{status.msg}</p>}
            </Step>

            <Step n={3} title="Elige el modelo" htmlFor="ia-gmodel">
              <select id="ia-gmodel" className="field-input w-full" value={model} onChange={e => setC({ ...c, [modelField(cloud)]: e.target.value })}>
                {(models.length ? models : [model]).map(m => <option key={m} value={m}>{m === OPENROUTER_AUTO ? 'Automático · todos los gratuitos' : m}</option>)}
              </select>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                {model === OPENROUTER_AUTO ? 'Prueba los modelos gratuitos en orden y salta al siguiente si uno está saturado o falla.'
                  : models.length ? 'Pulsa «Probar» otra vez si quieres actualizar la lista.' : 'Pulsa «Probar» para ver todos los modelos de tu cuenta.'}
              </p>
            </Step>

            <p className="flex gap-2 text-[11px] leading-relaxed text-muted">
              <Lock size={12} className="mt-0.5 shrink-0" />
              <span>La key se guarda solo en este navegador. Al usar la IA, tu pedido y los datos del bloque o flujo se envían a {CLOUD[cloud].name}; no envíes datos sensibles.</span>
            </p>
          </div>
        ) : c.provider === 'opencode' ? (
          <div className="space-y-3 border-t border-border pt-4">
            <Step n={1} title="Arranca OpenCode en tu equipo">
              <div className="space-y-2">
                <Segmented label="¿Tienes OpenCode instalado?" value={runner} onChange={setRunner}
                  options={[['cli', 'Sí, tengo el CLI'], ['npx', 'No, usar Node.js (npx)']]} />
                <Segmented label="Terminal" value={shell} onChange={setShell}
                  options={[['powershell', 'Windows (PowerShell)'], ['bash', 'macOS / Linux']]} />
              </div>

              {runner === 'cli' && (
                <div className="mt-2.5 border border-border bg-base/50 p-2 text-[11px] leading-relaxed text-muted">
                  <p>¿Aún no lo tienes? Instálalo una vez:</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <code className="min-w-0 flex-1 truncate border border-border bg-base px-2 py-1 font-mono text-[10.5px] text-text">{installCommand(shell)}</code>
                    <button className="btn shrink-0" onClick={() => copy('install', installCommand(shell))} aria-label="Copiar el comando de instalación">
                      {copied === 'install' ? <Check size={12} /> : <Copy size={12} />}<span className="hidden sm:inline">{copied === 'install' ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                  <p className="mt-1">Comprueba que funciona con <code>opencode --version</code>. Si la terminal no lo encuentra, ciérrala y abre otra.</p>
                </div>
              )}

              <ol className="mt-2.5 list-decimal space-y-1 pl-4 text-[11.5px] leading-relaxed">
                <li>Abre {shell === 'powershell' ? <>una terminal: tecla <b>Windows</b>, escribe <b>PowerShell</b> y pulsa Enter</> : <>una terminal (en macOS: <b>Terminal</b>, desde Spotlight)</>}.</li>
                <li>Copia el comando con el botón, pégalo en la terminal y pulsa <b>Enter</b>.{runner === 'npx' && <> La primera vez descarga OpenCode (necesita <a className="text-green" href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js</a>); tarda un poco.</>}</li>
                <li>Cuando aparezca <code className="text-green">opencode server listening on {ocUrl}</code>, está listo. <b>Deja la terminal abierta</b> mientras uses la IA; para detenerlo, pulsa <b>Ctrl+C</b>.</li>
              </ol>

              <div className="mt-2 border border-border bg-base">
                <pre ref={cmdRef} className="max-h-28 select-all overflow-auto whitespace-pre-wrap break-all p-2 font-mono text-[10.5px] leading-snug">{ocCommand}</pre>
                <div className="flex items-center gap-2 border-t border-border px-2 py-1.5">
                  <span className="flex-1 text-[10.5px] text-muted">{shell === 'powershell' ? 'PowerShell' : 'Bash / zsh'} · {runner === 'cli' ? 'CLI de OpenCode' : 'npx (Node.js)'}</span>
                  <button className={`btn ${copied === 'serve' ? '' : 'btn-primary'}`} onClick={() => copy('serve', ocCommand)}>
                    {copied === 'serve' ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar comando</>}
                  </button>
                </div>
              </div>
              {copyFailed && <p role="alert" className="mt-1.5 text-[11.5px] text-yellow">El navegador no dejó copiar automáticamente. El comando ya está seleccionado: pulsa <b>Ctrl+C</b> (⌘C en Mac).</p>}
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                El comando incluye la contraseña de esta configuración y arranca OpenCode con un agente <b>sin herramientas</b>: no puede leer ni cambiar archivos de tu equipo. Si cambias de navegador o de equipo, vuelve a copiarlo desde aquí.
              </p>
            </Step>

            <Step n={2} title="Conecta y prueba" htmlFor="ia-ocurl">
              <div className="flex gap-2">
                <input id="ia-ocurl" className="field-input min-w-0 flex-1 font-mono" spellCheck={false} value={ocUrl}
                  onChange={e => { setC({ ...c, opencodeUrl: e.target.value.trim() }); setStatus({ kind: 'idle' }) }} aria-label="Dirección del servidor de OpenCode" />
                <button className="btn shrink-0" onClick={testOpenCode} disabled={status.kind === 'loading'}>
                  {status.kind === 'loading' ? <Loader2 size={12} className="animate-spin" /> : status.kind === 'ok' ? <Check size={12} /> : null} Probar
                </button>
              </div>
              {status.msg && <p role="status" className={`mt-1.5 text-[11.5px] ${status.kind === 'err' ? 'text-red' : 'text-green'}`}>{status.msg}</p>}
              <p className="mt-1 text-[11px] text-muted">Si el navegador pregunta si la página puede acceder a la red local, permítelo.</p>
            </Step>

            <Step n={3} title="Elige el modelo" htmlFor="ia-ocmodel">
              <select id="ia-ocmodel" className="field-input w-full" value={c.opencodeModel || OPENCODE_DEFAULT_MODEL} onChange={e => setC({ ...c, opencodeModel: e.target.value })}>
                {(models.length ? models : [c.opencodeModel || OPENCODE_DEFAULT_MODEL]).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{models.length ? 'Todos son gratuitos. Si uno tarda o no responde, prueba otro.' : 'Pulsa «Probar» para ver los modelos gratuitos disponibles.'}</p>
            </Step>

            <p className="flex gap-2 text-[11px] leading-relaxed text-muted">
              <Lock size={12} className="mt-0.5 shrink-0" />
              <span>Tu pedido y los datos del bloque o flujo van de tu equipo a OpenCode Zen. Mientras son gratuitos, OpenCode puede usar esos datos para mejorar los modelos: no envíes datos sensibles. Solo funciona en equipos con el servidor arrancado.</span>
            </p>
          </div>
        ) : c.provider === 'webnn' ? (
          <div className="space-y-2 border-t border-border pt-4">
            {!nn ? (
              <div className="space-y-1.5 rounded border border-yellow/35 bg-yellow/10 px-2.5 py-2 text-[11.5px] leading-relaxed">
                <p>Este navegador aún no expone WebNN (<code>navigator.ml</code>). Es una API del W3C en fase de prueba:</p>
                <ol className="list-decimal pl-4">
                  <li>En Chrome o Edge abre <code>chrome://flags/#web-machine-learning-neural-network</code> (en Edge, <code>edge://flags/…</code>).</li>
                  <li>Actívala («Enabled») y reinicia el navegador.</li>
                  <li>Ten al día el driver de la NPU (Intel, AMD o Qualcomm).</li>
                </ol>
              </div>
            ) : (
              <>
                <label className="label block" htmlFor="ia-nndev">Dispositivo</label>
                <select id="ia-nndev" className="field-input w-full" value={c.webnnDevice ?? 'npu'} onChange={e => setC({ ...c, webnnDevice: e.target.value as WebNNDevice })}>
                  <option value="npu">NPU {devices.npu === false ? '· no disponible' : devices.npu ? '· disponible' : ''}</option>
                  <option value="gpu">GPU vía WebNN {devices.gpu === false ? '· no disponible' : devices.gpu ? '· disponible' : ''}</option>
                </select>
                <label className="label block pt-1" htmlFor="ia-nnmodel">Modelo local</label>
                <select id="ia-nnmodel" className="field-input w-full" value={c.webnnModel ?? WEBNN_MODELS[0].id} onChange={e => setC({ ...c, webnnModel: e.target.value })}>
                  {WEBNN_MODELS.map(m => <option key={m.id} value={m.id}>{m.label} · ~{String(m.size).replace('.', ',')} GB{m.size < 1 ? ' · rápido' : ' · mejor calidad'}</option>)}
                </select>
                <p className="text-[11.5px] leading-relaxed text-muted">
                  La primera vez se descarga el modelo (versión de ORT GenAI preparada para WebNN) y se compila para la NPU; después queda en la caché del navegador y solo se compila. Nada sale del equipo y no hay límite de uso. El contexto es fijo (2048 tokens) y los modelos pequeños son menos precisos: el asistente valida y repara lo que proponen.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2 border-t border-border pt-4">
            <label className="label block" htmlFor="ia-wmodel">Modelo local</label>
            <select id="ia-wmodel" className="field-input w-full" value={c.webllmModel} onChange={e => setC({ ...c, webllmModel: e.target.value })} disabled={!gpu}>
              {WEBLLM_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <p className="text-[11.5px] leading-relaxed text-muted">
              La primera vez se descarga el modelo (se guarda en la caché del navegador). Los modelos pequeños son menos precisos: el asistente valida y repara lo que proponen, pero Groq suele dar mejores flujos.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        {enabled && <button className="btn hover:!border-red/50 hover:!text-red" onClick={disable}>Desactivar IA</button>}
        <span className="flex-1" />
        <button className="btn" onClick={() => setOpen(false)}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={!canSave} title={canSave ? undefined : 'Pega una API key para guardar'}>Guardar</button>
      </div>
    </dialog>
  )
}

/** Paso numerado de la configuración */
/** Selector de dos o más opciones en fila */
function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="w-full text-[11px] text-muted sm:w-40">{label}</span>
      <div className="flex">
        {options.map(([v, text], i) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
            className={`border px-2 py-1 text-[11px] ${i ? '-ml-px' : ''} ${value === v ? 'relative z-10 border-green/60 bg-green/10 text-green' : 'border-border text-muted hover:text-text'}`}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

function Step({ n, title, htmlFor, children }: { n: number; title: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border text-[10.5px] text-muted">{n}</span>
      <div className="min-w-0 flex-1">
        <label className="mb-1.5 block text-[12px] font-bold" htmlFor={htmlFor}>{title}</label>
        {children}
      </div>
    </div>
  )
}
