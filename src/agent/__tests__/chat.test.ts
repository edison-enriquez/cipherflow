import { describe, expect, it } from 'vitest'
import { partialFlow, planSteps, topoKeys } from '../steps'
import { historyOf, routeIntent, threadTitle, type ChatMsg } from '../chat'
import { validateAnswer } from '../explain'
import type { AIFlow } from '../flowSpec'

const same = (a: any, b: any) => a.op === b.op && JSON.stringify(a.args ?? a.params) === JSON.stringify(b.args ?? b.params)
const L = (from: string, to: string, port = 0) => ({ from, to, port })

// Flujo abierto: Entrada → AES Encrypt → Salida
const before: AIFlow = {
  title: '', checks: [],
  blocks: [
    { key: 'b1', op: '__input', params: { text: 'hola' } },
    { key: 'b2', op: 'AES Encrypt', args: { Mode: 'CBC' } },
    { key: 'b3', op: '__output', params: { label: 'Cifrado' } },
  ],
  links: [L('b1', 'b2'), L('b2', 'b3')],
}
// Propuesta: cambia el modo, añade descifrado + su salida y quita nada
const final: AIFlow = {
  title: 'AES ida y vuelta', checks: [],
  blocks: [
    { key: 'b1', op: '__input', params: { text: 'hola' } },
    { key: 'b2', op: 'AES Encrypt', args: { Mode: 'CTR' } },
    { key: 'b3', op: '__output', params: { label: 'Cifrado' } },
    { key: 'd', op: 'AES Decrypt', args: { Mode: 'CTR' } },
    { key: 'o2', op: '__output', params: { label: 'Descifrado' } },
  ],
  links: [L('b1', 'b2'), L('b2', 'b3'), L('b2', 'd'), L('d', 'o2')],
}

describe('aplicar paso a paso', () => {
  it('ordena por dependencias', () => {
    const k = topoKeys(final)
    expect(k.indexOf('b2')).toBeLessThan(k.indexOf('d'))
    expect(k.indexOf('d')).toBeLessThan(k.indexOf('o2'))
  })

  it('solo propone lo que cambia, en orden', () => {
    expect(planSteps(final, before, same)).toEqual([
      { key: 'b2', kind: 'change', op: 'AES Encrypt' },
      { key: 'd', kind: 'add', op: 'AES Decrypt' },
      { key: 'o2', kind: 'add', op: '__output' },
    ])
  })

  it('cada paso usa la versión nueva de lo aplicado y la anterior de lo demás', () => {
    const steps = planSteps(final, before, same)
    const p0 = partialFlow(final, before, steps, 0)
    expect(p0.blocks.find(b => b.key === 'b2')!.args).toEqual({ Mode: 'CBC' })
    expect(p0.blocks.map(b => b.key)).toEqual(['b1', 'b2', 'b3'])
    const p2 = partialFlow(final, before, steps, 2)
    expect(p2.blocks.find(b => b.key === 'b2')!.args).toEqual({ Mode: 'CTR' })
    expect(p2.blocks.map(b => b.key)).toEqual(['b1', 'b2', 'b3', 'd'])
    expect(p2.links).toContainEqual(L('b2', 'd'))
    // Sin cables colgando hacia bloques que aún no existen
    expect(p2.links.every(l => p2.blocks.some(b => b.key === l.from) && p2.blocks.some(b => b.key === l.to))).toBe(true)
    const all = partialFlow(final, before, steps, steps.length)
    expect(all.blocks).toEqual(final.blocks)
    expect([...all.links].sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to))).toEqual([...final.links].sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to)))
  })

  it('quitar un bloque es el último paso y hasta entonces sigue con sus cables', () => {
    const f2: AIFlow = { ...before, blocks: before.blocks.filter(b => b.key !== 'b3'), links: [L('b1', 'b2')] }
    const out: AIFlow = { ...f2, blocks: [...f2.blocks, { key: 'x', op: '__output', params: { label: 'Nuevo' } }], links: [L('b1', 'b2'), L('b2', 'x')] }
    const steps = planSteps(out, before, same)
    expect(steps.map(s => `${s.kind}:${s.key}`)).toEqual(['add:x', 'remove:b3'])
    const p1 = partialFlow(out, before, steps, 1)
    expect(p1.blocks.map(b => b.key).sort()).toEqual(['b1', 'b2', 'b3', 'x'])
    expect(p1.links).toContainEqual(L('b2', 'b3'))
    expect(partialFlow(out, before, steps, 2).blocks.map(b => b.key)).not.toContain('b3')
  })

  it('un cable de entrada distinto cuenta como cambio', () => {
    const rewired: AIFlow = { ...before, links: [L('b1', 'b2'), L('b1', 'b3')] }
    expect(planSteps(rewired, before, same)).toEqual([{ key: 'b3', kind: 'change', op: '__output' }])
  })

  it('sin flujo abierto todo son altas', () => {
    expect(planSteps(before, null, same).map(s => s.kind)).toEqual(['add', 'add', 'add'])
  })
})

describe('pregunta o cambio', () => {
  it.each([
    ['¿Por qué falla este bloque?', 'ask'],
    ['qué hace el IV aquí', 'ask'],
    ['Explica el modo CBC', 'ask'],
    ['es seguro usar ECB', 'ask'],
    ['Añade el descifrado', 'build'],
    ['Cambia la clave a 32 bytes', 'build'],
    ['Calcula el SHA-256 de un texto', 'build'],
  ])('«%s» → %s', (t, kind) => expect(routeIntent(t, false).kind).toBe(kind))

  it('los comandos mandan sobre la heurística', () => {
    expect(routeIntent('/preguntar añade un bloque', false)).toEqual({ kind: 'ask', text: 'añade un bloque' })
    expect(routeIntent('/flujo ¿algo?', false)).toEqual({ kind: 'build', text: '¿algo?' })
    expect(routeIntent('/explicar', true)).toMatchObject({ kind: 'ask', text: expect.stringContaining('bloque') })
    expect(routeIntent('/arreglar', false)).toMatchObject({ kind: 'build', text: expect.stringContaining('fallan') })
  })
})

describe('historial', () => {
  const msgs: ChatMsg[] = [
    { id: '1', role: 'user', text: '¿Qué hace?', block: { id: 'n1', label: 'AES Encrypt' } },
    { id: '2', role: 'answer', text: 'Cifra con AES.', citations: [], rejected: [], followups: [] },
    { id: '3', role: 'error', text: 'x' },
  ]
  it('convierte los turnos en mensajes para el modelo, con el bloque', () => {
    expect(historyOf(msgs)).toEqual([
      { role: 'user', content: '[Sobre el bloque AES Encrypt] ¿Qué hace?' },
      { role: 'assistant', content: 'Cifra con AES.' },
    ])
    expect(threadTitle(msgs)).toBe('¿Qué hace?')
    expect(threadTitle([])).toBe('Conversación nueva')
  })
})

describe('respuestas verificadas', () => {
  const corpus = 'AES Encrypt {"IV":"0f0e0d0c"} salida 3d5821c1'
  it('acepta citas reales y limpia sugerencias', () => {
    const v = validateAnswer({ respuesta: 'El IV 0f0e0d0c cambia la salida 3d5821c1.', citas: ['0f0e0d0c', '3d5821c1'], sugerencias: ['Prueba otro IV', '', 'x'.repeat(200), 'Añade el descifrado', 'Otra', 'Sobra'] }, corpus)
    expect(v.ok && v.value).toMatchObject({ citations: ['0f0e0d0c', '3d5821c1'], rejected: [], followups: ['Prueba otro IV', 'Añade el descifrado', 'Otra'] })
  })
  it('rechaza si la mayoría de las citas son inventadas', () => {
    const v = validateAnswer({ respuesta: 'Sale ffff.', citas: ['ffff'] }, corpus)
    expect(v.ok).toBe(false)
  })
})
