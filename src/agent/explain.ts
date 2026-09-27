// «Explicar este bloque»: el modelo explica qué hizo una operación (o por qué falló) y declara
// qué valores cita. El harness comprueba que cada cita exista de verdad en la entrada, la
// salida o los parámetros del bloque; las inventadas se descartan (honestidad verificable).
import type { AgentConfig, CompleteFn, Message } from './llm'
import { recordMetric, runStructured, type Validation } from './harness'

export interface ExplainContext {
  op: string
  category: string
  description: string
  params: Record<string, unknown>
  inputText: string
  outputText: string
  error?: string
}
export interface Explanation { text: string; citations: string[]; rejected: string[] }

const HINT = 'Formato: {"explicacion": "texto en español, 2 a 5 frases", "citas": ["valores exactos que mencionas"]}'

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

/** ¿La cita aparece en los datos reales del bloque? (ignora espacios y mayúsculas, útil para hex). */
export function citationExists(cita: string, corpus: string): boolean {
  const c = norm(cita)
  return c.length > 0 && norm(corpus).includes(c)
}

export function corpusOf(ctx: ExplainContext) {
  return [ctx.op, JSON.stringify(ctx.params), ctx.inputText, ctx.outputText, ctx.error ?? ''].join('\n')
}

export function validateExplanation(obj: any, corpus: string): Validation<Explanation> {
  const text = typeof obj?.explicacion === 'string' ? obj.explicacion.trim() : ''
  if (!text) return { ok: false, errors: ['Falta «explicacion».'] }
  if (text.length > 1400) return { ok: false, errors: ['La explicación es demasiado larga; usa como máximo 5 frases.'] }
  const citas: string[] = Array.isArray(obj.citas) ? obj.citas.filter((c: unknown) => typeof c === 'string' && c.trim()).map((c: string) => c.trim()) : []
  const good = citas.filter(c => citationExists(c, corpus))
  const bad = citas.filter(c => !citationExists(c, corpus))
  // Si la mayoría de las citas son inventadas, se pide rehacer; si son pocas, se descartan sin más
  if (bad.length && bad.length >= Math.max(1, good.length)) return { ok: false, errors: [`Citas que NO aparecen en los datos del bloque: ${bad.map(b => JSON.stringify(b)).join(', ')}. Cita solo valores que estén en la entrada, la salida o los parámetros.`] }
  return { ok: true, value: { text, citations: good, rejected: bad } }
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + ` … (${s.length - n} caracteres más)` : s)

export async function explainNode(ctx: ExplainContext, config: AgentConfig, complete: CompleteFn, signal?: AbortSignal): Promise<Explanation | null> {
  const corpus = corpusOf(ctx)
  const res = await runStructured<Explanation>({
    config, complete, signal, formatHint: HINT, maxAttempts: 2,
    validate: o => validateExplanation(o, corpus),
    messages: [
      { role: 'system', content: `Eres un profesor de criptografía que explica, en español claro y breve, qué hizo un bloque de CipherFlow (una operación de CyberChef) con sus datos reales.
- Explica el concepto y relaciónalo con los valores concretos del bloque.
- Si hubo un error, explica la causa más probable y cómo corregirla.
- En "citas" pon los valores exactos (bytes en hex, textos, números) que mencionas; deben aparecer tal cual en los datos. No inventes valores.
- Responde SOLO con JSON. ${HINT}` },
      { role: 'user', content: `Operación: ${ctx.op} (${ctx.category})
Qué hace: ${ctx.description}
Parámetros: ${JSON.stringify(ctx.params)}
Entrada: ${clip(ctx.inputText || '(vacía)', 700)}
${ctx.error ? `ERROR: ${ctx.error}` : `Salida: ${clip(ctx.outputText || '(vacía)', 700)}`}` },
    ],
  })
  if (res.value?.rejected.length) recordMetric('citationsRejected', res.value.rejected.length)
  return res.value
}

// ── Preguntas libres sobre un bloque o el flujo (chat) ──────────────────────────
export interface Answer extends Explanation { followups: string[] }

const ASK_HINT = 'Formato: {"respuesta": "texto en español, breve", "citas": ["valores exactos que mencionas"], "sugerencias": ["hasta 3 pedidos cortos que el usuario podría hacer después"]}'

export function validateAnswer(obj: any, corpus: string): Validation<Answer> {
  const v = validateExplanation({ explicacion: obj?.respuesta ?? obj?.explicacion, citas: obj?.citas }, corpus)
  if (!v.ok) return { ok: false, errors: v.errors.map(e => e.replace('«explicacion»', '«respuesta»')) }
  const followups: string[] = (Array.isArray(obj.sugerencias) ? obj.sugerencias : [])
    .filter((s: unknown): s is string => typeof s === 'string' && !!s.trim()).map((s: string) => s.trim()).filter((s: string) => s.length <= 90).slice(0, 3)
  return { ok: true, value: { ...v.value, followups } }
}

export interface AskRequest {
  question: string
  /** Qué se pregunta: los datos reales del bloque o del flujo, ya en texto */
  subject: 'bloque' | 'flujo'
  context: string
  /** Texto contra el que se verifican las citas */
  corpus: string
  /** Turnos anteriores de la conversación (solo texto), para dar continuidad */
  history?: Message[]
  config: AgentConfig
  complete: CompleteFn
  signal?: AbortSignal
}

/** Responde una pregunta con los datos reales; las citas que no aparezcan en ellos se descartan. */
export async function askAI(req: AskRequest): Promise<Answer | null> {
  const res = await runStructured<Answer>({
    config: req.config, complete: req.complete, signal: req.signal, formatHint: ASK_HINT, maxAttempts: 2,
    validate: o => validateAnswer(o, req.corpus),
    messages: [
      { role: 'system', content: `Eres el asistente de CipherFlow, un editor visual de flujos criptográficos con operaciones de CyberChef. Respondes preguntas sobre ${req.subject === 'bloque' ? 'un bloque concreto' : 'el flujo abierto'} usando sus datos reales, como un profesor de criptografía: claro, breve (2 a 6 frases) y en español.
- Relaciona la respuesta con los valores concretos. Si algo falla, explica la causa más probable y cómo corregirla.
- En "citas" pon los valores exactos (hex, textos, números) que mencionas; deben aparecer tal cual en los datos. No inventes valores.
- En "sugerencias" propone hasta 3 siguientes pasos útiles, como pedidos cortos en imperativo (p. ej. "Añade el descifrado para comprobarlo").
- Responde SOLO con JSON. ${ASK_HINT}` },
      ...(req.history ?? []).slice(-6),
      { role: 'user', content: `Datos reales del ${req.subject}:\n${req.context}\n\nPregunta: ${req.question}` },
    ],
  })
  if (res.value?.rejected.length) recordMetric('citationsRejected', res.value.rejected.length)
  return res.value
}
