// «Explicar este bloque»: el modelo explica qué hizo una operación (o por qué falló) y declara
// qué valores cita. El harness comprueba que cada cita exista de verdad en la entrada, la
// salida o los parámetros del bloque; las inventadas se descartan (honestidad verificable).
import type { AgentConfig, CompleteFn } from './llm'
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
