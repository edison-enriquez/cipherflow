import { describe, expect, it } from 'vitest'
import { parseLooseJSON, runStructured } from '../harness'
import { cfg, scripted } from './fixtures'

describe('parseLooseJSON', () => {
  it('acepta JSON limpio sin marcarlo como reparado', () => {
    expect(parseLooseJSON('{"a":1}')).toEqual({ value: { a: 1 }, repaired: false })
  })
  it('extrae el objeto de un bloque ```json con prosa alrededor', () => {
    expect(parseLooseJSON('Claro, aquí está:\n```json\n{"a": {"b": "x}y"}}\n```\nListo.')?.value).toEqual({ a: { b: 'x}y' } })
  })
  it('quita comas finales y razonamiento <think>', () => {
    expect(parseLooseJSON('<think>pienso {no}</think>{"l": [1, 2,],}')?.value).toEqual({ l: [1, 2] })
  })
  it('repara JSON truncado cerrando llaves y cadenas', () => {
    const r = parseLooseJSON('{"title": "Flujo", "blocks": [{"key": "in"')
    expect(r?.repaired).toBe(true)
    expect(r?.value.blocks[0].key).toBe('in')
  })
  it('devuelve null si no hay ningún objeto', () => {
    expect(parseLooseJSON('no sé')).toBeNull()
  })
})

describe('runStructured', () => {
  const validate = (o: any) => (typeof o.n === 'number' ? { ok: true as const, value: o.n as number } : { ok: false as const, errors: ['«n» debe ser un número'] })

  it('reintenta con el motivo del rechazo y acepta la corrección', async () => {
    const m = scripted([{ n: 'dos' }, { n: 2 }])
    const r = await runStructured({ config: cfg, messages: [{ role: 'user', content: 'hola' }], validate, complete: m.complete, formatHint: '{"n": number}' })
    expect(r.value).toBe(2)
    expect(m.seen[1].at(-1)!.content).toContain('RECHAZADA')
    expect(m.seen[1].at(-1)!.content).toContain('«n» debe ser un número')
  })

  it('ejecuta una herramienta y le devuelve el resultado al modelo', async () => {
    const m = scripted([{ tool: 'doble', args: { x: 21 } }, { n: 42 }])
    const r = await runStructured({
      config: cfg, messages: [], validate, complete: m.complete, formatHint: '',
      tools: { doble: { description: '', run: a => String(a.x * 2) } },
    })
    expect(r.value).toBe(42)
    expect(m.seen[1].at(-1)!.content).toBe('[Resultado de doble]\n42')
  })

  it('limita las rondas de herramientas', async () => {
    const m = scripted([{ tool: 't' }, { tool: 't' }, { n: 1 }])
    const r = await runStructured({ config: cfg, messages: [], validate, complete: m.complete, formatHint: '', maxToolRounds: 1, tools: { t: { description: '', run: () => 'ok' } } })
    expect(r.value).toBe(1)
    expect(m.seen[2].at(-1)!.content).toContain('No puedes usar más herramientas')
  })

  it('se rinde de forma controlada tras agotar los intentos', async () => {
    const m = scripted(['prosa sin json', { n: 'x' }])
    const r = await runStructured({ config: cfg, messages: [], validate, complete: m.complete, formatHint: '', maxAttempts: 2 })
    expect(r.value).toBeNull()
    expect(r.errors).toEqual(['«n» debe ser un número'])
  })
})

describe('retryAfter (límite de Groq)', () => {
  it('lee la espera en segundos y en minutos', async () => {
    const { retryAfter } = await import('../llm')
    expect(retryAfter('Rate limit reached ... Please try again in 7.66s. Need more tokens?')).toBeCloseTo(7.66)
    expect(retryAfter('Please try again in 1m2.5s')).toBeCloseTo(62.5)
    expect(retryAfter('otro error')).toBeNull()
  })
})

describe('jsonClosed (parada temprana del modelo local)', () => {
  it('detecta cuándo el objeto JSON ya está completo', async () => {
    const { jsonClosed } = await import('../webnnLLM')
    expect(jsonClosed('{"a": {"b": "}"}')).toBe(false)
    expect(jsonClosed('texto {"a": {"b": "}"}} y más')).toBe(true)
    expect(jsonClosed('sin json')).toBe(false)
  })
})
