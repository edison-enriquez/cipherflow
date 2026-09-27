// Banco de evaluación del asistente de flujos: pedidos con el resultado correcto conocido,
// calculado aparte (no con CyberChef), para medir si un cambio (modelo, prompt, grafo de pasos)
// mejora o empeora al agente. Las comprobaciones que declara el propio modelo no cuentan: aquí
// se mira si alguna Salida del flujo contiene el valor verdadero.
import type { AgentConfig, CompleteFn } from './llm'
import type { Catalog } from './catalog'
import type { AIFlow } from './flowSpec'
import { runFlowAgent, type ExecuteFn, type NodeOutcome } from './flowAgent'

/** Lo que debe aparecer en alguna Salida. `anyOf`: vale cualquiera (p. ej. hex o el texto crudo). */
export interface Expect { anyOf: string[] }
export interface EvalCase {
  id: string
  /** Tema, para ver por separado dónde falla el agente */
  kind: 'codificación' | 'hash' | 'clásico' | 'cifrado' | 'cadena' | 'texto'
  request: string
  expect: Expect[]
  /** Una solución correcta: el test del banco la ejecuta en el motor real para validar el caso. */
  reference: AIFlow
}

/** Sin espacios (el hex puede salir «4a 97» o «4a97»). */
export const norm = (s: string) => s.replace(/\s+/g, '')
const isHex = (s: string) => /^[0-9a-f]+$/i.test(s)
/** ¿`text` contiene `want`? En valores hex no importan las mayúsculas; en el resto, sí. */
export function matches(text: string, want: string): boolean {
  const t = norm(text), w = norm(want)
  return isHex(w) ? t.toLowerCase().includes(w.toLowerCase()) : t.includes(w)
}

/** ¿Las Salidas del flujo contienen cada valor esperado? Devuelve los que faltan. */
export function grade(flow: AIFlow, outcomes: Record<string, NodeOutcome>, expect: Expect[]): string[] {
  const outs = flow.blocks.filter(b => b.op === '__output').map(b => outcomes[b.key]).filter(o => o?.ok).map(o => o!.text ?? '')
  return expect.filter(e => !e.anyOf.some(v => outs.some(t => matches(t, v)))).map(e => e.anyOf.join(' | '))
}

export interface CaseResult {
  id: string
  kind: EvalCase['kind']
  /** Alguna Salida tiene el valor verdadero */
  correct: boolean
  /** El propio agente dio el flujo por bueno (todo ejecuta y sus checks pasan) */
  selfSuccess: boolean
  /** Rondas de construir→ejecutar→reparar usadas (0: nunca produjo un flujo válido) */
  rounds: number
  /** Llamadas al modelo */
  calls: number
  ms: number
  missing: string[]
  error?: string
  flow?: AIFlow
}

export interface BenchSummary {
  cases: number
  /** % de casos con el valor correcto */
  accuracy: number
  /** % correctos a la primera ronda (sin reparar) */
  firstTry: number
  /** % en que el agente dijo «éxito» pero el resultado era incorrecto (falsa confianza) */
  falseSuccess: number
  avgCalls: number
  avgMs: number
  byKind: Record<string, { cases: number; correct: number }>
}

export interface BenchRequest {
  cases: EvalCase[]
  config: AgentConfig
  complete: CompleteFn
  catalog: Catalog
  execute: ExecuteFn
  maxRounds?: number
  onCase?: (r: CaseResult, i: number) => void
  signal?: AbortSignal
}

/** Ejecuta el agente sobre cada caso, uno detrás de otro (los proveedores gratuitos limitan por minuto). */
export async function runBench(req: BenchRequest): Promise<{ results: CaseResult[]; summary: BenchSummary }> {
  const results: CaseResult[] = []
  for (const [i, c] of req.cases.entries()) {
    let calls = 0
    const complete: CompleteFn = (cfg, m, o) => { calls++; return req.complete(cfg, m, o) }
    const t0 = Date.now()
    let r: CaseResult
    try {
      const res = await runFlowAgent({
        request: c.request, config: req.config, complete, catalog: req.catalog, execute: req.execute,
        maxRounds: req.maxRounds, signal: req.signal, onStep: () => {},
      })
      const missing = res ? grade(res.flow, res.outcomes, c.expect) : c.expect.map(e => e.anyOf.join(' | '))
      r = { id: c.id, kind: c.kind, correct: !!res && !missing.length, selfSuccess: !!res?.success, rounds: res?.rounds ?? 0, calls, ms: Date.now() - t0, missing, flow: res?.flow }
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e
      r = { id: c.id, kind: c.kind, correct: false, selfSuccess: false, rounds: 0, calls, ms: Date.now() - t0, missing: [], error: String(e?.message ?? e) }
    }
    results.push(r)
    req.onCase?.(r, i)
  }
  return { results, summary: summarize(results) }
}

export function summarize(rs: CaseResult[]): BenchSummary {
  const n = rs.length || 1
  const pct = (k: number) => Math.round((k / n) * 1000) / 10
  const byKind: BenchSummary['byKind'] = {}
  for (const r of rs) {
    const k = (byKind[r.kind] ??= { cases: 0, correct: 0 })
    k.cases++; if (r.correct) k.correct++
  }
  return {
    cases: rs.length,
    accuracy: pct(rs.filter(r => r.correct).length),
    firstTry: pct(rs.filter(r => r.correct && r.rounds === 1).length),
    falseSuccess: pct(rs.filter(r => r.selfSuccess && !r.correct).length),
    avgCalls: Math.round((rs.reduce((s, r) => s + r.calls, 0) / n) * 10) / 10,
    avgMs: Math.round(rs.reduce((s, r) => s + r.ms, 0) / n),
    byKind,
  }
}
