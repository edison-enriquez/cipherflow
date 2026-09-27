// Harness del agente (adaptado de Codara): todo lo que rodea al modelo para que sea fiable.
//   1. El modelo responde JSON (nunca texto libre).
//   2. Si pide una herramienta ({"tool": …}), el harness la ejecuta y el bucle sigue.
//   3. Si la respuesta es inválida, se le devuelve el motivo y se reintenta.
//   4. Si todo se agota, se informa del fallo de forma controlada (sin romper la app).
// Nada aquí depende del proveedor ni de la red: el modelo es una función inyectable.
import type { AgentConfig, CompleteFn, Message } from './llm'

// ── Telemetría ─────────────────────────────────────────────────────────────────
const METRICS_KEY = 'cipherflow.ia.metricas'
export type Metric = 'calls' | 'toolCalls' | 'toolErrors' | 'parseFailures' | 'retries' | 'repaired' | 'invalid' | 'fallbacks'
  | 'flowRuns' | 'flowSuccess' | 'flowRepairs' | 'citationsRejected'
const mem: Partial<Record<Metric, number>> = {}
export function recordMetric(m: Metric, n = 1) {
  try {
    const all = JSON.parse(localStorage.getItem(METRICS_KEY) || '{}')
    all[m] = (all[m] ?? 0) + n
    localStorage.setItem(METRICS_KEY, JSON.stringify(all))
  } catch { mem[m] = (mem[m] ?? 0) + n }
}
export const getMetrics = (): Partial<Record<Metric, number>> => { try { return JSON.parse(localStorage.getItem(METRICS_KEY) || '{}') } catch { return { ...mem } } }
if (typeof window !== 'undefined') (window as any).__cipherflowAgent = { getMetrics, reset: () => { try { localStorage.removeItem(METRICS_KEY) } catch { /* nada */ } } }

// ── JSON tolerante ─────────────────────────────────────────────────────────────
/** Extrae el primer objeto JSON de la respuesta (quita ```json, prosa alrededor y comas finales). */
export function parseLooseJSON(raw: string): { value: any; repaired: boolean } | null {
  const s = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  try { return { value: JSON.parse(s), repaired: false } } catch { /* sigue */ }
  const start = s.indexOf('{')
  if (start < 0) return null
  // Recorre respetando cadenas para encontrar la llave que cierra el primer objeto
  let depth = 0, inStr = false, esc = false, end = -1
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) { end = i; break }
  }
  let body = end > 0 ? s.slice(start, end + 1) : s.slice(start)
  body = body.replace(/,\s*([}\]])/g, '$1')
  // JSON truncado: se cierran las llaves y corchetes abiertos
  if (end < 0) {
    const stack: string[] = []
    let q = false, e = false
    for (const c of body) {
      if (q) { if (e) e = false; else if (c === '\\') e = true; else if (c === '"') q = false; continue }
      if (c === '"') q = true; else if (c === '{' || c === '[') stack.push(c); else if (c === '}' || c === ']') stack.pop()
    }
    if (q) body += '"'
    body += stack.reverse().map(c => (c === '{' ? '}' : ']')).join('')
  }
  try { return { value: JSON.parse(body), repaired: true } } catch { return null }
}

// ── Bucle estructurado ─────────────────────────────────────────────────────────
export interface Tool { description: string; run: (args: any) => string }
export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] }

export interface StructuredRequest<T> {
  config: AgentConfig
  messages: Message[]
  /** Convierte y comprueba el JSON del modelo. Los errores vuelven al modelo como feedback. */
  validate: (obj: any) => Validation<T>
  tools?: Record<string, Tool>
  complete: CompleteFn
  signal?: AbortSignal
  onProgress?: (p: { progress: number; text: string }) => void
  maxAttempts?: number
  maxToolRounds?: number
  /** Recordatorio del formato esperado que se añade al feedback de reintento. */
  formatHint: string
  /** Aviso de cada respuesta rechazada que se va a reintentar (para mostrarlo en la interfaz). */
  onRejected?: (errors: string[]) => void
}

export interface StructuredResult<T> {
  value: T | null
  /** Conversación completa (para continuar reparando en otra vuelta). */
  messages: Message[]
  calls: number
  errors: string[]
}

export async function runStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
  const maxAttempts = Math.max(1, req.maxAttempts ?? 2)
  const maxTools = req.tools ? Math.max(0, req.maxToolRounds ?? 3) : 0
  const messages = [...req.messages]
  let toolRounds = 0, invalid = 0, calls = 0, lastErrors: string[] = []

  while (invalid < maxAttempts) {
    if (req.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    calls++
    recordMetric('calls')
    const raw = (await req.complete(req.config, messages, { json: true, signal: req.signal, onProgress: req.onProgress })).trim()
    messages.push({ role: 'assistant', content: raw })
    const parsed = parseLooseJSON(raw)
    if (parsed?.repaired) recordMetric('repaired')

    // a) Herramienta
    const tool = parsed?.value?.tool
    if (typeof tool === 'string' && req.tools) {
      if (toolRounds >= maxTools || !req.tools[tool]) {
        recordMetric('toolErrors')
        messages.push({ role: 'user', content: toolRounds >= maxTools
          ? 'No puedes usar más herramientas. Responde AHORA con el resultado final en JSON.'
          : `La herramienta «${tool}» no existe. Disponibles: ${Object.keys(req.tools).join(', ')}.` })
        toolRounds++
        continue
      }
      toolRounds++
      recordMetric('toolCalls')
      let out: string
      try { out = req.tools[tool].run(parsed!.value.args ?? {}) } catch (e: any) { recordMetric('toolErrors'); out = 'Error: ' + (e?.message ?? e) }
      messages.push({ role: 'user', content: `[Resultado de ${tool}]\n${out}` })
      continue
    }

    // b) Respuesta final
    if (!parsed) { recordMetric('parseFailures'); lastErrors = ['La respuesta no es JSON válido.'] }
    else {
      const v = req.validate(parsed.value)
      if (v.ok) return { value: v.value, messages, calls, errors: [] }
      recordMetric('invalid')
      lastErrors = v.errors
    }
    invalid++
    if (invalid < maxAttempts) {
      recordMetric('retries')
      req.onRejected?.(lastErrors)
      messages.push({ role: 'user', content: feedback(lastErrors, req.formatHint) })
    }
  }
  recordMetric('fallbacks')
  return { value: null, messages, calls, errors: lastErrors }
}

export const feedback = (errors: string[], hint: string) =>
  'Tu respuesta fue RECHAZADA:\n' + errors.slice(0, 12).map(e => `- ${e}`).join('\n') + `\nCorrige y responde SOLO con el JSON. ${hint}`
