import { describe, expect, it } from 'vitest'
import { runFlowAgent, type FlowStep, type NodeOutcome } from '../flowAgent'
import { b64Flow, cfg, fakeCatalog, scripted } from './fixtures'

/** Motor falso: To Base64 de «hola» = «aG9sYQ==»; un bloque llamado «roto» falla. */
const fakeExecute = async (spec: { n: [string, string, number, number, any?][] }) => {
  const out: Record<string, NodeOutcome> = {}
  for (const [key, op] of spec.n) {
    if (key === 'roto') out[key] = { ok: false, err: 'Invalid key length: 3 bytes' }
    else if (op === 'To Base64' || op === '__output') out[key] = { ok: true, text: 'aG9sYQ==' }
    else out[key] = { ok: true, text: 'hola' }
  }
  return out
}

describe('runFlowAgent (orquestador)', () => {
  it('valida, ejecuta y termina cuando todo funciona y las comprobaciones se cumplen', async () => {
    const m = scripted([b64Flow({ checks: [{ block: 'out', contains: 'aG9sYQ' }] })])
    const steps: FlowStep[] = []
    const r = await runFlowAgent({ request: 'codifica en base64', config: cfg, complete: m.complete, catalog: fakeCatalog, execute: fakeExecute, onStep: s => steps.push(s) })
    expect(r?.success).toBe(true)
    expect(r?.checks).toEqual([{ description: '«out» contiene «aG9sYQ»', ok: true }])
    expect(steps.map(s => s.type)).toEqual(['plan', 'build', 'built', 'run', 'ran', 'done'])
    // el contexto incluye los parámetros reales de las operaciones relevantes
    expect(m.seen[0][1].content).toContain('To Base64 — Formato de datos')
  })

  it('devuelve al modelo la operación inventada y luego el error real del motor', async () => {
    const invented = b64Flow(); (invented.blocks[1] as any).op = 'Base64 Encode'
    const broken = b64Flow({ blocks: [...b64Flow().blocks, { key: 'roto', op: 'SHA2', args: {} }], links: [['in', 'b64'], ['b64', 'out'], ['in', 'roto']] })
    const m = scripted([invented, broken, b64Flow()])
    const steps: FlowStep[] = []
    const r = await runFlowAgent({ request: 'base64', config: cfg, complete: m.complete, catalog: fakeCatalog, execute: fakeExecute, onStep: s => steps.push(s) })
    expect(r?.success).toBe(true)
    expect(r?.rounds).toBe(2)
    expect(m.seen[1].at(-1)!.content).toMatch(/«Base64 Encode» no existe.*«To Base64»/)
    const repair = m.seen[2].at(-1)!.content
    expect(repair).toContain('Ejecuté tu flujo en el motor real')
    expect(repair).toContain('«roto» (SHA2) falló: Invalid key length: 3 bytes')
    expect(steps.some(s => s.type === 'repair')).toBe(true)
  })

  it('un bloque que DEBE fallar (fails: true) cuenta como éxito', async () => {
    const f = b64Flow({ blocks: [...b64Flow().blocks, { key: 'roto', op: 'SHA2', args: {} }], links: [['in', 'b64'], ['b64', 'out'], ['in', 'roto']], checks: [{ block: 'roto', fails: true }] })
    const r = await runFlowAgent({ request: 'x', config: cfg, complete: scripted([f]).complete, catalog: fakeCatalog, execute: fakeExecute, onStep: () => {} })
    expect(r?.success).toBe(true)
  })

  it('si nunca lo logra, devuelve el mejor intento sin lanzar error', async () => {
    const m = scripted([b64Flow({ checks: [{ block: 'out', startsWith: 'zzz' }] }), b64Flow({ checks: [{ block: 'out', startsWith: 'zzz' }] })])
    const r = await runFlowAgent({ request: 'x', config: cfg, complete: m.complete, catalog: fakeCatalog, execute: fakeExecute, onStep: () => {}, maxRounds: 2 })
    expect(r?.success).toBe(false)
    expect(r?.checks[0].ok).toBe(false)
  })

  it('recibe el flujo abierto y restaura los datos abreviados antes de ejecutarlo', async () => {
    const edited = b64Flow(); (edited.blocks[0] as any).params.text = '⟨conservar:in⟩'
    const m = scripted([edited])
    let ran = ''
    const current = {
      json: JSON.stringify({ blocks: b64Flow().blocks, links: b64Flow().links }), outputs: ['- out «Resultado»: "aG9sYQ=="'],
      expand: (f: any) => ({ ...f, blocks: f.blocks.map((b: any) => b.params?.text === '⟨conservar:in⟩' ? { ...b, params: { ...b.params, text: 'dato largo real' } } : b) }),
    }
    const exec = async (spec: any) => { ran = spec.n[0][4].text; return fakeExecute(spec) }
    const r = await runFlowAgent({ request: 'cambia este flujo', config: cfg, complete: m.complete, catalog: fakeCatalog, execute: exec, onStep: () => {}, current })
    expect(m.seen[0][1].content).toContain('Flujo ABIERTO ahora en el lienzo')
    expect(m.seen[0][1].content).toContain('Salidas actuales')
    expect(ran).toBe('dato largo real')
    expect(r?.flow.blocks[0].params?.text).toBe('dato largo real')
  })
})
