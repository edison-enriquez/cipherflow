// Valida el banco de evaluación con el motor real: cada caso es resoluble (su solución de
// referencia da el valor verdadero) y la puntuación distingue aciertos de falsos éxitos.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadEngineNode } from './node'
import { BENCH_CASES } from '../src/agent/benchCases'
import { grade, matches, runBench } from '../src/agent/bench'
import { layoutFlow, validateAIFlow } from '../src/agent/flowSpec'
import type { CompleteFn } from '../src/agent/llm'

let runtime: typeof import('../src/agent/runtime')
beforeAll(async () => {
  await loadEngineNode()
  runtime = await import('../src/agent/runtime')
}, 60_000)

const cfg = { provider: 'groq' as const, groqKey: 'x', groqModel: 'x', webllmModel: 'x' }
/** Modelo falso que responde siempre el flujo dado */
const answers = (pick: (request: string) => object): CompleteFn => async (_c, m) =>
  JSON.stringify(pick(m.find(x => x.role === 'user')!.content))

describe('casos del banco', () => {
  it('ids únicos y al menos 25 casos', () => {
    expect(new Set(BENCH_CASES.map(c => c.id)).size).toBe(BENCH_CASES.length)
    expect(BENCH_CASES.length).toBeGreaterThanOrEqual(25)
  })

  it.each(BENCH_CASES.map(c => [c.id, c] as const))('%s: la solución de referencia es válida y da el valor verdadero', async (_id, c) => {
    const v = validateAIFlow(c.reference, runtime.catalog())
    expect(v.ok ? [] : v.errors).toEqual([])
    const outcomes = await runtime.executeFlow(layoutFlow(c.reference))
    const errors = Object.entries(outcomes).filter(([, o]) => !o.ok).map(([k, o]) => `${k}: ${o.err}`)
    expect(errors).toEqual([])
    expect(grade(c.reference, outcomes, c.expect)).toEqual([])
  })
})

describe('puntuación', () => {
  it('compara sin espacios; ignora mayúsculas solo en hex', () => {
    expect(matches('4A 97 28', '4a9728')).toBe(true)
    expect(matches('criptografia', 'CRIPTOGRAFIA')).toBe(false)
    expect(matches('... --- ...', '...---...')).toBe(true)
  })

  it('un agente que acierta puntúa 100 % a la primera', async () => {
    const cases = BENCH_CASES.slice(0, 3)
    const { summary } = await runBench({
      cases, config: cfg, catalog: runtime.catalog(), execute: runtime.executeFlow,
      complete: answers(req => cases.find(c => req.includes(c.request))!.reference),
    })
    expect(summary).toMatchObject({ cases: 3, accuracy: 100, firstTry: 100, falseSuccess: 0, avgCalls: 1 })
  })

  it('un flujo que ejecuta bien pero con el dato equivocado cuenta como falso éxito', async () => {
    const c = BENCH_CASES.find(x => x.id === 'b64-enc')!
    const wrong = { ...c.reference, blocks: c.reference.blocks.map(b => b.op === '__input' ? { ...b, params: { ...b.params, text: 'hola' } } : b) }
    const { results, summary } = await runBench({ cases: [c], config: cfg, catalog: runtime.catalog(), execute: runtime.executeFlow, complete: answers(() => wrong) })
    expect(results[0]).toMatchObject({ correct: false, selfSuccess: true, missing: ['aG9sYSBtdW5kbw=='] })
    expect(summary.falseSuccess).toBe(100)
  })

  it('un modelo que no produce JSON válido cuenta como fallo sin rondas', async () => {
    const c = BENCH_CASES[0]
    const { results } = await runBench({ cases: [c], config: cfg, catalog: runtime.catalog(), execute: runtime.executeFlow, maxRounds: 1, complete: async () => 'no sé' })
    expect(results[0]).toMatchObject({ correct: false, rounds: 0 })
  })
})
