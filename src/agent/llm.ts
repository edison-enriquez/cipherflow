// Capa única de acceso a modelos (adaptada de Codara). Todo ocurre en el navegador:
//   · Groq   → API en la nube con la key del usuario (su API admite CORS).
//   · WebLLM → modelo local en la GPU (WebGPU); nada sale del equipo.
// OpenCode Free no se incluye: su API no admite CORS y su nivel gratuito solo funciona
// desde su propio cliente, así que requeriría un servidor intermedio.
import type { MLCEngine } from '@mlc-ai/web-llm'

export interface Message { role: 'system' | 'user' | 'assistant'; content: string }
export type Provider = 'groq' | 'webllm'
export interface AgentConfig { provider: Provider; groqKey: string; groqModel: string; webllmModel: string }
export interface LoadProgress { progress: number; text: string }

/** El modelo debe responder JSON (modo JSON nativo en Groq; decodificación restringida en WebLLM). */
export interface CompleteOptions { json?: boolean; signal?: AbortSignal; onProgress?: (p: LoadProgress) => void; maxTokens?: number; temperature?: number }
export type CompleteFn = (config: AgentConfig, messages: Message[], opts?: CompleteOptions) => Promise<string>

// ── Groq ────────────────────────────────────────────────────────────────────────
const GROQ = 'https://api.groq.com/openai/v1'
export const GROQ_DEFAULT_MODEL = 'llama-3.3-70b-versatile'

async function groqComplete(cfg: AgentConfig, messages: Message[], o: CompleteOptions): Promise<string> {
  const body = (json: boolean) => JSON.stringify({
    model: cfg.groqModel || GROQ_DEFAULT_MODEL, messages, stream: false,
    max_tokens: o.maxTokens ?? 1536, temperature: o.temperature ?? 0.2,
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  })
  const call = (json: boolean) => fetch(`${GROQ}/chat/completions`, {
    method: 'POST', signal: o.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.groqKey}` },
    body: body(json),
  })
  let res = await call(!!o.json)
  // Algunos modelos no admiten el modo JSON: se reintenta sin él (el harness valida igual)
  if (!res.ok && o.json && res.status === 400) res = await call(false)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = (err as any)?.error?.message as string | undefined
    if (res.status === 401) throw new Error('Groq rechazó la API key. Revísala en Ajustes de IA.')
    if (res.status === 429) throw new Error('Groq: límite de uso alcanzado por ahora. Espera un momento o cambia de modelo.')
    throw new Error(msg ? `Groq: ${msg}` : `Groq respondió con HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

/** Modelos disponibles para la key (Groq cambia su catálogo a menudo). */
export async function listGroqModels(key: string): Promise<string[]> {
  const res = await fetch(`${GROQ}/models`, { headers: { Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(res.status === 401 ? 'La API key no es válida.' : `Groq respondió con HTTP ${res.status}`)
  const data = await res.json()
  return (data.data ?? [])
    .filter((m: any) => m.active !== false && !/whisper|tts|guard|embed|vision/i.test(m.id))
    .map((m: any) => m.id as string)
    .sort()
}

// ── WebLLM (local) ──────────────────────────────────────────────────────────────
export const WEBLLM_MODELS: { id: string; label: string }[] = [
  { id: 'Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC', label: 'Qwen2.5 Coder 3B · ~2 GB · recomendado para generar flujos' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 3B · ~2 GB · equilibrado' },
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: 'Llama 3.2 1B · ~0,9 GB · rápido, menos preciso' },
  { id: 'Llama-3.1-8B-Instruct-q4f16_1-MLC', label: 'Llama 3.1 8B · ~5 GB · mejor calidad (equipo potente)' },
]
export const webgpuAvailable = () => typeof navigator !== 'undefined' && 'gpu' in navigator

let engineP: Promise<MLCEngine> | null = null
let engineModel = ''

async function resolveModel(model: string) {
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
    .then(w => w.CreateMLCEngine(eff, { initProgressCallback: r => onProgress?.({ progress: r.progress ?? 0, text: r.text ?? '' }) }))
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
  try {
    const r = await eng.chat.completions.create({
      messages, stream: false, temperature: o.temperature ?? 0.2, max_tokens: o.maxTokens ?? 1536,
      ...(o.json ? { response_format: { type: 'json_object' as const } } : {}),
    })
    return r.choices[0]?.message?.content ?? ''
  } catch (e) { engineP = null; engineModel = ''; throw friendly(e) }
}

/** Punto único de llamada al modelo, con la misma firma para ambos proveedores. */
export const completeLLM: CompleteFn = (cfg, messages, opts = {}) =>
  cfg.provider === 'webllm' ? webllmComplete(cfg, messages, opts) : groqComplete(cfg, messages, opts)
