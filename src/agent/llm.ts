// Capa única de acceso a modelos (adaptada de Codara). Todo ocurre en el navegador:
//   · Groq, OpenRouter y Alibaba Model Studio (Qwen) → APIs en la nube compatibles con OpenAI,
//     con la key del usuario (las tres admiten CORS, así que se llaman directo desde el navegador).
//   · WebLLM → modelo local en la GPU (WebGPU); nada sale del equipo.
//   · WebNN  → modelo local en la NPU (o GPU) vía la API WebNN del W3C, con Transformers.js/ONNX Runtime.
// OpenCode Zen no se incluye (verificado 2026-09): /chat/completions, /messages y /responses
// responden 404 al preflight CORS, y los modelos gratis devuelven 403 FreeTierError fuera de su
// propio cliente; incluso a través de `opencode serve` local (v1.18) la API HTTP recibe ese 403,
// solo `opencode run`/TUI funcionan. Un módulo WASM no lo evita (usa el mismo fetch); para modelos gratis desde el
// navegador se usa OpenRouter con los modelos «:free».
import type { MLCEngine } from '@mlc-ai/web-llm'
import { NPU_MODELS, NpuLLM } from './webnnLLM'
import { OPENCODE_DEFAULT_MODEL, OPENCODE_DEFAULT_URL, openCodeComplete } from './opencode'

export interface Message { role: 'system' | 'user' | 'assistant'; content: string }
export type CloudProvider = 'groq' | 'openrouter' | 'qwen'
/** 'opencode': servidor local de OpenCode (modelos gratuitos de Zen), ver opencode.ts */
export type Provider = CloudProvider | 'opencode' | 'webllm' | 'webnn'
export type WebNNDevice = 'npu' | 'gpu'
/** Modelos locales (WebLLM en la GPU y WebNN en la NPU): ocultos por ahora. En las pruebas con una
 * GPU/NPU integrada resultaron demasiado lentos o inestables (compilación de minutos, «device lost»). */
export const LOCAL_PROVIDERS = false
/** Proveedores en la nube que se ofrecen en los ajustes (Alibaba Model Studio queda oculto). */
export const VISIBLE_CLOUD: CloudProvider[] = ['groq', 'openrouter']
export interface AgentConfig {
  provider: Provider
  groqKey: string; groqModel: string
  openrouterKey?: string; openrouterModel?: string
  qwenKey?: string; qwenModel?: string
  webllmModel: string; webnnModel?: string; webnnDevice?: WebNNDevice
  opencodeUrl?: string; opencodePassword?: string; opencodeModel?: string
}
export interface LoadProgress { progress: number; text: string }

/** El modelo debe responder JSON (modo JSON nativo en Groq; decodificación restringida en WebLLM). */
export interface CompleteOptions { json?: boolean; signal?: AbortSignal; onProgress?: (p: LoadProgress) => void; maxTokens?: number; temperature?: number }
export type CompleteFn = (config: AgentConfig, messages: Message[], opts?: CompleteOptions) => Promise<string>

// ── APIs en la nube (compatibles con OpenAI) ─────────────────────────────────────
export const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile'

export interface CloudSpec {
  name: string
  base: string
  defaultModel: string
  keyUrl: string
  keyHint: string
  /** Cabeceras extra (OpenRouter pide identificar la app) */
  headers?: Record<string, string>
  /** Modelos sugeridos al principio de la lista */
  featured?: string[]
}
export const CLOUD: Record<CloudProvider, CloudSpec> = {
  groq: { name: 'Groq', base: 'https://api.groq.com/openai/v1', defaultModel: GROQ_DEFAULT_MODEL, keyUrl: 'https://console.groq.com/keys', keyHint: 'gsk_…' },
  openrouter: {
    name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', defaultModel: 'auto:free', keyUrl: 'https://openrouter.ai/settings/keys', keyHint: 'sk-or-…',
    headers: { 'X-Title': 'CipherFlow' },
    // Solo modelos gratuitos (sin saldo: 20/min y 50/día). «auto:free» rota entre todos; los
    // primeros admiten modo JSON y «openrouter/free» (elige uno cualquiera) queda al final
    featured: ['google/gemma-4-31b-it:free', 'qwen/qwen3.8-27b:free', 'nvidia/nemotron-3-super-120b-a12b:free', 'google/gemma-4-26b-a4b-it:free', 'openrouter/free'],
  },
  qwen: {
    name: 'Alibaba Model Studio (Qwen)', base: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen3.8-flash',
    keyUrl: 'https://modelstudio.console.alibabacloud.com/', keyHint: 'sk-…',
    featured: ['qwen3.8-flash', 'qwen3.7-flash', 'qwen3.8-27b'],
  },
}
export const isCloud = (p: Provider): p is CloudProvider => p in CLOUD
export function cloudKey(cfg: AgentConfig, p: CloudProvider = cfg.provider as CloudProvider) {
  return (p === 'groq' ? cfg.groqKey : p === 'openrouter' ? cfg.openrouterKey : cfg.qwenKey) ?? ''
}
export function cloudModel(cfg: AgentConfig, p: CloudProvider = cfg.provider as CloudProvider) {
  const m = (p === 'groq' ? cfg.groqModel : p === 'openrouter' ? cfg.openrouterModel : cfg.qwenModel) || CLOUD[p].defaultModel
  return p === 'openrouter' && !isFreeOpenRouter(m) ? CLOUD.openrouter.defaultModel : m
}
/** Modo automático de OpenRouter: rota entre todos los modelos gratuitos. */
export const OPENROUTER_AUTO = 'auto:free'
/** En OpenRouter solo se permiten los modelos gratuitos. */
export const isFreeOpenRouter = (id?: string) => !!id && (id.endsWith(':free') || id === 'openrouter/free')

const errMessage = (e: any): string | undefined => e?.error?.message ?? e?.message ?? (typeof e?.error === 'string' ? e.error : undefined)

async function cloudComplete(cfg: AgentConfig, messages: Message[], o: CompleteOptions): Promise<string> {
  const p = cfg.provider as CloudProvider
  const model = cloudModel(cfg)
  if (p !== 'openrouter' || model !== OPENROUTER_AUTO) return cloudAttempt(cfg, model, messages, o)
  // Automático: se recorren todos los modelos gratuitos, empezando por el último que respondió
  const list = await freeOpenRouterModels()
  let last: unknown
  for (let i = 0; i < list.length; i++) {
    const id = list[(orCursor + i) % list.length]
    if (i > 0) o.onProgress?.({ progress: 0, text: `OpenRouter: probando ${id} (${i + 1}/${list.length})…` })
    try {
      const out = await cloudAttempt(cfg, id, messages, o)
      if (!out.trim()) throw new SkipModel(`${id} respondió vacío`)
      orCursor = (orCursor + i) % list.length
      return out
    } catch (e) {
      if (!(e instanceof SkipModel)) throw e
      last = e
    }
  }
  throw new Error(`OpenRouter: ninguno de los ${list.length} modelos gratuitos respondió ahora (${(last as Error)?.message}). Prueba en unos minutos o usa Groq.`)
}

/** Fallo propio del modelo (saturado, caído, sin soporte): en modo automático se pasa al siguiente. */
class SkipModel extends Error {}

async function cloudAttempt(cfg: AgentConfig, model: string, messages: Message[], o: CompleteOptions): Promise<string> {
  const p = cfg.provider as CloudProvider
  const spec = CLOUD[p]
  const auto = p === 'openrouter' && cfg.openrouterModel === OPENROUTER_AUTO
  const body = (json: boolean) => JSON.stringify({
    model, messages, stream: false,
    // Modelo gratuito fijo: si está caído o saturado, OpenRouter pasa a otro gratuito
    ...(p === 'openrouter' && !auto && model !== 'openrouter/free' ? { models: [model, 'openrouter/free'] } : {}),
    max_tokens: o.maxTokens ?? 1536, temperature: o.temperature ?? 0.2,
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  })
  const call = (json: boolean) => fetch(`${spec.base}/chat/completions`, {
    method: 'POST', signal: o.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cloudKey(cfg)}`, ...spec.headers },
    body: body(json),
  })
  let res = await call(!!o.json)
  // Algunos modelos no admiten el modo JSON: se reintenta sin él (el harness valida igual)
  if (!res.ok && o.json && res.status === 400) res = await call(false)
  // Límite por minuto de la cuenta: si la espera es corta, se espera y se reintenta (una vez)
  let err: any = null
  if (res.status === 429) {
    err = await res.json().catch(() => ({}))
    const m = errMessage(err) ?? ''
    const wait = retryAfter(m) ?? (Number(res.headers.get('retry-after')) || null) ?? resetIn(res)
    const perModel = auto && isUpstream(m, err)
    if (!perModel && wait !== null && wait <= 60 && !DAILY.test(m)) {
      o.onProgress?.({ progress: 0, text: `${spec.name}: límite por minuto; reintento en ${Math.ceil(wait)} s…` })
      await abortableSleep(wait * 1000 + 300, o.signal)
      res = await call(!!o.json); err = null
    }
  }
  if (!res.ok) {
    err ??= await res.json().catch(() => ({}))
    const msg = errMessage(err)
    if (res.status === 401 || res.status === 403) throw new Error(`${spec.name} rechazó la API key. Revísala en Ajustes de IA.`)
    if (res.status === 402) throw new Error(`${spec.name}: la cuenta no tiene saldo para este modelo. Elige un modelo gratuito o recarga créditos.`)
    // Los límites de la cuenta (diario, por minuto) valen para todos los modelos: no sirve rotar
    if (res.status === 429 && (!auto || !isUpstream(msg ?? '', err))) throw new Error(rateLimitMessage(p, msg ?? '', err, res))
    if (auto) throw new SkipModel(`${model}: ${msg ?? 'HTTP ' + res.status}`)
    throw new Error(msg ? `${spec.name}: ${msg}` : `${spec.name} respondió con HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

const isUpstream = (msg: string, err: any) => /upstream/i.test(msg) || !!err?.error?.metadata?.raw

// Groq: «per day»/TPD/RPD; OpenRouter: «free-models-per-day»
const DAILY = /per[- ]?day|TPD|RPD/i

/** Segundos hasta que se renueva el límite (OpenRouter manda X-RateLimit-Reset en ms desde epoch). */
function resetIn(res: Response): number | null {
  const r = Number(res.headers.get('x-ratelimit-reset'))
  return r > 0 ? Math.max(0, (r - Date.now()) / 1000) : null
}

/** Explica qué límite se alcanzó: diario de la cuenta, por minuto o saturación del proveedor del modelo. */
export function rateLimitMessage(p: CloudProvider, msg: string, err: any, res: Response): string {
  const name = CLOUD[p].name
  if (DAILY.test(msg)) {
    if (p !== 'openrouter') return `${name}: se agotó el límite diario de este modelo. Cambia a otro modelo u otro proveedor en Ajustes de IA.`
    const s = resetIn(res)
    const when = s !== null ? ` Se renuevan a las ${new Date(Date.now() + s * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : ''
    return `${name}: se agotaron las 50 peticiones gratuitas de hoy de tu cuenta (cuentan para todos los modelos «:free»).${when} Mientras tanto usa Groq, o compra 10 $ de créditos una vez para subir a 1000 al día.`
  }
  if (/upstream/i.test(msg) || err?.error?.metadata?.raw) {
    const provider = err?.error?.metadata?.provider_name
    return `${name}: el modelo gratuito está saturado en su proveedor${provider ? ` (${provider})` : ''}. Elige otro modelo gratuito en Ajustes de IA o prueba en unos minutos.`
  }
  return `${name}: límite por minuto alcanzado${p === 'openrouter' ? ' (20 peticiones/min en los modelos gratuitos)' : ''}. Espera un momento y vuelve a intentarlo.`
}

/** Segundos de espera que Groq indica en el mensaje («Please try again in 7.66s» / «1m2.5s»). */
export function retryAfter(msg: string): number | null {
  const m = /try again in (?:(\d+)m)?([\d.]+)s/i.exec(msg)
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null
}
const abortableSleep = (ms: number, signal?: AbortSignal) => new Promise<void>((ok, ko) => {
  const t = setTimeout(ok, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); ko(new DOMException('Aborted', 'AbortError')) }, { once: true })
})

/** Modelos de chat disponibles para la key (los catálogos cambian a menudo). */
export async function listCloudModels(p: CloudProvider, key: string): Promise<string[]> {
  const spec = CLOUD[p]
  if (p === 'openrouter') {
    // El catálogo de OpenRouter es público: la key se comprueba aparte
    const k = await fetch(`${spec.base}/key`, { headers: { Authorization: `Bearer ${key}` } })
    if (!k.ok) throw new Error('La API key no es válida.')
  }
  const res = await fetch(`${spec.base}/models`, { headers: { Authorization: `Bearer ${key}`, ...spec.headers } })
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'La API key no es válida.' : `${spec.name} respondió con HTTP ${res.status}`)
  const ids = chatModels(p, (await res.json()).data ?? [])
  return p === 'openrouter' ? [OPENROUTER_AUTO, ...ids] : ids
}

/** Modelos de chat del catálogo, con los sugeridos primero. En OpenRouter, solo los gratuitos. */
function chatModels(p: CloudProvider, data: any[]): string[] {
  const ids: string[] = data
    .filter((m: any) => m.active !== false && !/whisper|tts|guard|embed|vision|image|audio|omni|-vl/i.test(m.id))
    .filter((m: any) => !m.architecture?.output_modalities || m.architecture.output_modalities.includes('text'))
    // OpenRouter: solo gratuitos (precio 0) y de chat; fuera los filtros de moderación
    .filter((m: any) => p !== 'openrouter' || (isFreeOpenRouter(m.id) && !+m.pricing?.prompt && !+m.pricing?.completion && !/safety/i.test(m.id)))
    .map((m: any) => m.id as string)
    .sort()
  const top = (CLOUD[p].featured ?? []).filter(f => ids.includes(f))
  return [...top, ...ids.filter(i => !top.includes(i))]
}

// Rotación del modo automático: catálogo de gratuitos (público, se renueva cada hora) y el
// índice del último modelo que respondió, para seguir con él en la próxima llamada
let freeCache: { at: number; ids: string[] } | null = null
let orCursor = 0
export async function freeOpenRouterModels(): Promise<string[]> {
  if (freeCache && Date.now() - freeCache.at < 3600_000) return freeCache.ids
  try {
    const res = await fetch(`${CLOUD.openrouter.base}/models`)
    const ids = chatModels('openrouter', res.ok ? (await res.json()).data ?? [] : [])
    if (!ids.length) throw new Error('catálogo vacío')
    // «openrouter/free» es un enrutador genérico: mejor como último recurso
    freeCache = { at: Date.now(), ids: [...ids.filter(i => i !== 'openrouter/free'), 'openrouter/free'] }
    orCursor = 0
    return freeCache.ids
  } catch { return freeCache?.ids ?? (CLOUD.openrouter.featured ?? []) }
}
/** Solo para tests: olvida el catálogo y la posición de la rotación. */
export function resetFreeRotation() { freeCache = null; orCursor = 0 }

// ── WebLLM (local) ──────────────────────────────────────────────────────────────
export const WEBLLM_MODELS: { id: string; label: string }[] = [
  { id: 'Qwen3.8-2B-q4f16_1-MLC', label: 'Qwen3.8 2B (destilado, comunidad) · ~1,1 GB · rápido' },
  { id: 'Qwen3.5-4B-q4f16_1-MLC', label: 'Qwen3.5 4B · ~2,5 GB · buena calidad' },
  { id: 'Qwen3.5-2B-q4f16_1-MLC', label: 'Qwen3.5 2B · ~1,3 GB · rápido' },
  { id: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 Coder 3B · ~2 GB · recomendado para generar flujos' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 3B · ~2 GB · equilibrado' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B · ~0,9 GB · rápido, menos preciso' },
  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC', label: 'Llama 3.1 8B · ~5 GB · mejor calidad (equipo potente)' },
]
export const webgpuAvailable = () => typeof navigator !== 'undefined' && 'gpu' in navigator

let engineP: Promise<MLCEngine> | null = null
let engineModel = ''

// Modelos de Hugging Face que no vienen en el catálogo de WebLLM: ya cuantizados y compilados
// para WebGPU (formato MLC). Qwen3.8 2B es un destilado de Qwen3.8 sobre la arquitectura
// Qwen3.5-2B (empero-ai), cuantizado a q4f16_1 por nyaaorick.
const CUSTOM_WEBLLM = [
  {
    model: 'https://huggingface.co/nyaaorick/Qwen3.8-2B-q4f16_1-MLC',
    model_id: 'Qwen3.8-2B-q4f16_1-MLC',
    model_lib: 'https://huggingface.co/nyaaorick/Qwen3.8-2B-q4f16_1-MLC/resolve/main/Qwen3.8-2B-q4f16_1_cs1k-webgpu.wasm',
    vram_required_MB: 2300,
    low_resource_required: true,
    required_features: ['shader-f16'],
    overrides: { context_window_size: 4096 },
  },
]

async function resolveModel(model: string) {
  if (CUSTOM_WEBLLM.some(m => m.model_id === model)) return model
  try {
    const adapter = await (navigator as any).gpu?.requestAdapter()
    if (model.includes('q4f16') && !adapter?.features?.has('shader-f16')) return model.replace('q4f16', 'q4f32')
  } catch { /* se intenta con el modelo pedido */ }
  return model
}

async function engine(model: string, onProgress?: (p: LoadProgress) => void) {
  const eff = await resolveModel(model)
  if (engineP && engineModel === eff) return engineP
  engineModel = eff
  // Import dinámico: web-llm es pesado y solo se descarga al usar el modelo local
  engineP = import('@mlc-ai/web-llm')
    .then(w => {
      const create = (cacheBackend: 'cache' | 'indexeddb') => w.CreateMLCEngine(eff, {
        appConfig: { ...w.prebuiltAppConfig, model_list: [...w.prebuiltAppConfig.model_list, ...CUSTOM_WEBLLM], cacheBackend },
        initProgressCallback: r => onProgress?.({ progress: r.progress ?? 0, text: r.text ?? '' }),
      })
      // Si la Cache API no está disponible (ventana privada, perfil dañado), se guarda en IndexedDB
      return create('cache').catch(e => { if (/CacheStorage|caches/i.test(String(e?.message ?? e))) return create('indexeddb'); throw e })
    })
    .then(eng => {
      // En GPUs integradas, un prefill de 1024 tokens de una vez supera el límite de ~2 s de
      // Windows (TDR) y el sistema reinicia la GPU («device lost»). En bloques de 128 tokens
      // cada paso es corto; el kernel compilado acepta cualquier tamaño hasta su máximo.
      for (const pl of (eng as any).loadedModelIdToPipeline?.values?.() ?? []) if (pl.prefillChunkSize > PREFILL_CHUNK) pl.prefillChunkSize = PREFILL_CHUNK
      return eng
    })
    .catch(e => { engineP = null; engineModel = ''; throw e })
  return engineP
}

function friendly(e: any): Error {
  const m = String(e?.message ?? e)
  if (/out of memory|OOM|allocation failed|exceeds the limit/i.test(m)) return new Error('Tu GPU se quedó sin memoria para este modelo. Prueba uno más pequeño o usa Groq.')
  if (/DEVICE_REMOVED|device lost|requestDevice/i.test(m)) return new Error('Se perdió el acceso a la GPU (WebGPU). Actualiza los drivers, reinicia el navegador o usa Groq.')
  if (/ShaderModule|createComputePipeline|f16/i.test(m)) return new Error('Tu GPU no pudo compilar el modelo. Prueba otro modelo o usa Groq.')
  return e instanceof Error ? e : new Error(m)
}

async function webllmComplete(cfg: AgentConfig, messages: Message[], o: CompleteOptions): Promise<string> {
  if (!webgpuAvailable()) throw new Error('Este navegador no tiene WebGPU. Usa Chrome o Edge recientes, o elige Groq en Ajustes de IA.')
  let eng: MLCEngine
  try { eng = await engine(cfg.webllmModel, o.onProgress) } catch (e) { throw friendly(e) }
  if (o.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const ask = async (json: boolean) => {
    // Sin gramática, el JSON se pide en el prompt (el harness lo repara y valida igual)
    const msgs = o.json && !json ? [...messages.slice(0, -1), { ...messages.at(-1)!, content: messages.at(-1)!.content + '\n\nResponde SOLO con un objeto JSON, sin texto adicional.' }] : messages
    const r = await eng.chat.completions.create({
      messages: msgs, stream: false, temperature: o.temperature ?? 0.2, max_tokens: o.maxTokens ?? 1536,
      ...(json ? { response_format: { type: 'json_object' as const } } : {}),
    })
    return r.choices[0]?.message?.content ?? ''
  }
  try {
    if (o.json && !noGrammar.has(engineModel)) {
      try { return await ask(true) } catch (e: any) {
        // Algunos modelos de la comunidad no traen lo que necesita la decodificación restringida
        if (!/grammar|xgrammar|response format/i.test(String(e?.message ?? e))) throw e
        noGrammar.add(engineModel)
      }
    }
    return await ask(false)
  } catch (e) {
    // Solo se descarta el motor si se perdió la GPU; si no, se reutiliza (evita recargar el modelo)
    if (/DEVICE_REMOVED|device lost|disposed/i.test(String((e as any)?.message ?? e))) { engineP = null; engineModel = '' }
    throw friendly(e)
  }
}
const noGrammar = new Set<string>()
const PREFILL_CHUNK = 128

// ── WebNN (NPU) ─────────────────────────────────────────────────────────────────
// Modelos ORT GenAI preparados para WebNN, con formas fijas (ver webnnLLM.ts).
export { NPU_MODELS as WEBNN_MODELS } from './webnnLLM'
/** Contexto fijo (prompt + respuesta) de las sesiones WebNN, en tokens. */
export const WEBNN_MAX_LENGTH = 2048
export const webnnAvailable = () => typeof navigator !== 'undefined' && 'ml' in navigator

/** ¿El navegador puede crear un contexto WebNN en ese dispositivo? */
export async function probeWebNN(device: WebNNDevice): Promise<boolean> {
  if (!webnnAvailable()) return false
  try { await (navigator as any).ml.createContext({ deviceType: device }); return true } catch { return false }
}

let npuP: Promise<NpuLLM> | null = null
let npuKey = ''

function npu(id: string, device: WebNNDevice, onProgress?: (p: LoadProgress) => void, signal?: AbortSignal) {
  const key = id + '@' + device
  if (npuP && npuKey === key) return npuP
  npuKey = key
  const model = NPU_MODELS.find(m => m.id === id) ?? NPU_MODELS[0]
  const l = new NpuLLM(model, device, WEBNN_MAX_LENGTH)
  npuP = l.load(onProgress, signal).then(() => l)
    .catch(e => { npuP = null; npuKey = ''; throw e })
  return npuP
}

function friendlyWebNN(e: any, device: WebNNDevice): Error {
  const m = String(e?.message ?? e)
  if (e?.name === 'AbortError') return e
  if (!webnnAvailable()) return new Error('Este navegador no tiene WebNN. En Chrome o Edge activa chrome://flags/#web-machine-learning-neural-network y reinicia.')
  if (/admite \d+/.test(m)) return e
  if (/out of memory|allocation|OOM|exceeds/i.test(m)) return new Error(`La ${device.toUpperCase()} se quedó sin memoria para este modelo. Prueba el modelo más pequeño.`)
  return new Error(`WebNN (${device.toUpperCase()}): ${m}`)
}

async function webnnComplete(cfg: AgentConfig, messages: Message[], o: CompleteOptions): Promise<string> {
  const device = cfg.webnnDevice ?? 'npu'
  if (!webnnAvailable()) throw friendlyWebNN(new Error('WebNN'), device)
  let llm: NpuLLM
  try { llm = await npu(cfg.webnnModel || NPU_MODELS[0].id, device, o.onProgress, o.signal) } catch (e) { throw friendlyWebNN(e, device) }
  if (o.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  // Sin modo JSON nativo: se pide en el prompt y el harness repara/valida la respuesta
  const withHint = (ms: Message[]) => o.json ? [...ms.slice(0, -1), { ...ms.at(-1)!, content: ms.at(-1)!.content + '\n\nResponde SOLO con un objeto JSON, sin texto adicional.' }] : ms
  const want = o.maxTokens ?? 1024
  let ids = llm.encode(withHint(messages))
  // Contexto fijo: si la conversación (reintentos, reparaciones) no cabe, se quedan el sistema,
  // el pedido original y los dos últimos mensajes
  if (ids.length + 256 > WEBNN_MAX_LENGTH && messages.length > 4) ids = llm.encode(withHint([messages[0], messages[1], ...messages.slice(-2)]))
  try {
    return await llm.generate(ids, Math.min(want, WEBNN_MAX_LENGTH - ids.length - 1), {
      signal: o.signal,
      onToken: n => { if (n % 8 === 0) o.onProgress?.({ progress: Math.min(0.99, n / want), text: `Generando en la ${device.toUpperCase()}… ${n} tokens` }) },
    })
  } catch (e) { throw friendlyWebNN(e, device) }
}

/** Punto único de llamada al modelo, con la misma firma para todos los proveedores. */
export const completeLLM: CompleteFn = (cfg, messages, opts = {}) =>
  cfg.provider === 'opencode' ? openCodeComplete({
    settings: { url: cfg.opencodeUrl || OPENCODE_DEFAULT_URL, password: cfg.opencodePassword ?? '' },
    model: cfg.opencodeModel || OPENCODE_DEFAULT_MODEL, messages, json: opts.json, signal: opts.signal,
    onProgress: text => opts.onProgress?.({ progress: 0, text }),
  })
  : cfg.provider === 'webllm' ? webllmComplete(cfg, messages, opts)
    : cfg.provider === 'webnn' ? webnnComplete(cfg, messages, opts)
    : cloudComplete(cfg, messages, opts)
