// Ejecuta cada ejemplo de la galería con el motor real: operaciones y argumentos existentes, y sin
// errores salvo los que el ejemplo muestra a propósito. Los que salen a Internet solo se validan.
import { beforeAll, describe, expect, it } from 'vitest'
import { loadEngineNode } from './node'

/** Bloques que fallan a propósito (y sus salidas). */
const EXPECTED_ERRORS: Record<string, string[]> = {}

let ex: typeof import('../src/examples')
let io: typeof import('../src/io')
let cc: typeof import('../src/engine/cyberchef')
let graph: typeof import('../src/engine/graph')
let catalog: typeof import('../src/engine/catalog')
let rt: typeof import('../src/agent/runtime')
beforeAll(async () => {
  await loadEngineNode()
  ;[ex, io, cc, graph, catalog, rt] = await Promise.all([import('../src/examples'), import('../src/io'), import('../src/engine/cyberchef'), import('../src/engine/graph'), import('../src/engine/catalog'), import('../src/agent/runtime')])
  catalog.buildCatalog()
}, 60_000)

describe('galería de ejemplos', () => {
  it('nombres únicos entre grupos y cada ejemplo con descripción', () => {
    const keys = ex.EXAMPLE_GROUPS.flatMap(g => Object.keys(g.examples))
    expect(new Set(keys).size).toBe(keys.length)
    for (const [k, e] of Object.entries(ex.EXAMPLES)) expect(e.d.length, k).toBeGreaterThan(20)
  })

  it('todos los ejemplos se ejecutan', async () => {
    const problems: string[] = []
    for (const [name, e] of Object.entries(ex.EXAMPLES)) {
      for (const [k, op, , , args] of e.n) {
        if (catalog.isCustom(op)) continue
        const cfg = cc.opConfig(op)
        if (!cfg) { problems.push(`${name} · ${k}: no existe «${op}»`); continue }
        for (const a of Object.keys(args ?? {})) if (!cfg.args.some(x => x.name === a)) problems.push(`${name} · ${k}: «${op}» no tiene el argumento «${a}»`)
      }
      if (e.n.some(([, op]) => ex.LIVE_OPS.has(op))) continue
      const { nodes, edges, map } = io.buildFlow(e)
      const res = await graph.runGraph(nodes, edges)
      const expected = new Set((EXPECTED_ERRORS[name] ?? []).map(k => map[k]))
      for (const [k, id] of Object.entries(map)) {
        const r = res[id]
        if (!r?.ok && !expected.has(id)) problems.push(`${name} · ${k}: ${r?.err ?? 'sin resultado'}`)
        if (r?.ok && expected.has(id)) problems.push(`${name} · ${k}: debía fallar`)
      }
      if (process.env.SHOW) for (const [k, op, , , a] of e.n) if (op === '__output') console.log(`[${name}] ${a?.label}:\n  ${rt.resultText(res[map[k]]).slice(0, 300)}`)
    }
    expect(problems).toEqual([])
  }, 120_000)
})
