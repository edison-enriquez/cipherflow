// Aplicar una propuesta paso a paso sobre un lienzo real (motor de CyberChef en Node).
import { beforeAll, describe, expect, it } from 'vitest'
import { loadEngineNode } from './node'
import { layoutFlow, type AIFlow } from '../src/agent/flowSpec'
import { partialFlow, planSteps } from '../src/agent/steps'

let rt: typeof import('../src/agent/runtime')
let buildFlow: typeof import('../src/io').buildFlow
beforeAll(async () => { await loadEngineNode(); rt = await import('../src/agent/runtime'); ({ buildFlow } = await import('../src/io')) }, 60_000)

const K = { string: '000102030405060708090a0b0c0d0e0f', option: 'Hex' }
const IV = { string: '0f0e0d0c0b0a09080706050403020100', option: 'Hex' }
const start: AIFlow = {
  title: 'AES', checks: [],
  blocks: [
    { key: 'a', op: '__input', params: { text: 'mensaje secreto', fmt: 'Texto (UTF-8)' } },
    { key: 'b', op: 'AES Encrypt', args: { Key: K, IV, Mode: 'CBC', Input: 'Raw', Output: 'Hex' } },
    { key: 'c', op: '__output', params: { label: 'Cifrado' } },
  ],
  links: [{ from: 'a', to: 'b', port: 0 }, { from: 'b', to: 'c', port: 0 }],
}

describe('paso a paso sobre el lienzo', () => {
  it('reconoce los bloques sin cambios aunque el modelo repita todos los parámetros', async () => {
    const { nodes, edges } = buildFlow(layoutFlow(start))
    const cur = rt.describeCurrent(nodes, edges, {})
    const before = rt.currentAsFlow(cur)
    // El modelo devuelve el flujo con las keys del lienzo (b1, b2, b3), todos los parámetros y un bloque nuevo
    const [k1, k2, k3] = before.blocks.map(b => b.key)
    const final: AIFlow = {
      title: 'AES ida y vuelta', checks: [],
      blocks: [
        { key: k1, op: '__input', params: { text: 'mensaje secreto', fmt: 'Texto (UTF-8)' } },
        { key: k2, op: 'AES Encrypt', args: { Key: K, IV, Mode: 'CBC', Input: 'Raw', Output: 'Hex', 'Additional Authenticated Data': { string: '', option: 'Hex' } } },
        { key: k3, op: '__output', params: { label: 'Cifrado' } },
        { key: 'd', op: 'AES Decrypt', args: { Key: K, IV, Mode: 'CBC', Input: 'Hex', Output: 'Raw' } },
        { key: 'e', op: '__output', params: { label: 'Descifrado' } },
      ],
      links: [{ from: k1, to: k2, port: 0 }, { from: k2, to: k3, port: 0 }, { from: k2, to: 'd', port: 0 }, { from: 'd', to: 'e', port: 0 }],
    }
    const steps = planSteps(final, before, rt.sameBlock)
    expect(steps.map(s => `${s.kind}:${s.key}`)).toEqual(['add:d', 'add:e'])

    // Paso 1: el descifrado aparece conectado; los nodos existentes conservan su id
    let base = { ...cur, nodes }
    const g1 = rt.applyToCanvas(partialFlow(final, before, steps, 1), base)
    expect(g1.nodes).toHaveLength(4)
    expect(g1.nodes.slice(0, 3).map(n => n.id)).toEqual(nodes.map(n => n.id))
    // Paso 2: la salida nueva se engancha al descifrado creado en el paso 1 (mismo id)
    base = { ...cur, ids: { ...cur.ids, ...g1.ids }, nodes: g1.nodes }
    const g2 = rt.applyToCanvas(partialFlow(final, before, steps, 2), base)
    expect(g2.nodes).toHaveLength(5)
    expect(g2.ids.d).toBe(g1.ids.d)
    const out = await rt.executeFlow(layoutFlow(final))
    expect(out.e).toMatchObject({ ok: true, text: 'mensaje secreto' })
    expect(g2.edges.some(e => e.source === g1.ids.d && e.target === g2.ids.e)).toBe(true)
  })
})
