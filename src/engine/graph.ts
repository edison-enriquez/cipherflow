// Ejecución del grafo: cada bloque se calcula una vez que sus entradas están listas.
// Los resultados se guardan en caché por bloque, parámetros y entradas, así que editar
// un bloque solo recalcula lo que depende de él.
import { bytesDish, dishBytes, dishType, runOperation } from './cyberchef'
import { isCustom, opInfo } from './catalog'
import { fromB64, fromHex, utf8 } from '../lib/bytes'
import type { DataEdgeT, OpNodeT, Result } from './types'

let serial = 0
const cache = new Map<string, { key: string; res: Result }>()
export const invalidate = (id: string) => cache.delete(id)
export const clearCache = () => cache.clear()

export const inPort = (e: DataEdgeT) => Number(String(e.targetHandle ?? 'in0').replace('in', '')) || 0

async function makeResult(dish: any, extra: Partial<Result>): Promise<Result> {
  return { ok: true, serial: ++serial, dish, type: dishType(dish), bytes: await dishBytes(dish), ...extra }
}

async function execNode(n: OpNodeT, ins: (Result | null)[]): Promise<Result> {
  const t0 = performance.now()
  const { op, args, params = {} } = n.data
  const ms = () => performance.now() - t0
  if (op === '__input') {
    const b = params.file ? fromB64(params.file) : params.fmt === 'Hex' ? fromHex(params.text) : params.fmt === 'Base64' ? fromB64(params.text) : utf8(params.text ?? '')
    return makeResult(bytesDish(b), { ms: ms() })
  }
  if (op === '__output') {
    if (!ins[0]) throw new Error('Conecta una entrada')
    return { ...ins[0], serial: ++serial, ms: 0 }
  }
  if (op === '__xor2' || op === '__concat') {
    if (!ins[0] || !ins[1]) throw new Error('Conecta las dos entradas')
    const a = ins[0].bytes!, b = ins[1].bytes!
    let o: Uint8Array
    if (op === '__xor2') {
      if (!b.length) throw new Error('La entrada 2 está vacía')
      o = a.map((x, i) => x ^ b[i % b.length])
    } else {
      const s = utf8(params.sep ?? '')
      o = new Uint8Array(a.length + s.length + b.length); o.set(a); o.set(s, a.length); o.set(b, a.length + s.length)
    }
    return makeResult(bytesDish(o), { ms: ms() })
  }
  const r = await runOperation(op, args ?? [], ins[0]?.dish ?? null)
  return makeResult(r.dish, { ms: ms(), op: r.op })
}

export function topoOrder(nodes: OpNodeT[], edges: DataEdgeT[]): string[] {
  const indeg = new Map(nodes.map(n => [n.id, 0]))
  edges.forEach(e => indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1))
  const byId = new Map(nodes.map(n => [n.id, n]))
  const q = nodes.filter(n => !indeg.get(n.id)).sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x).map(n => n.id)
  const out: string[] = []
  while (q.length) {
    const id = q.shift()!
    out.push(id)
    edges.filter(e => e.source === id).map(e => byId.get(e.target)!).filter(Boolean).sort((a, b) => a.position.y - b.position.y).forEach(m => {
      indeg.set(m.id, indeg.get(m.id)! - 1)
      if (!indeg.get(m.id) && !out.includes(m.id) && !q.includes(m.id)) q.push(m.id)
    })
  }
  nodes.forEach(n => { if (!out.includes(n.id)) out.push(n.id) })
  return out
}

export function wouldCycle(edges: DataEdgeT[], source: string, target: string): boolean {
  if (source === target) return true
  const stack = [target], seen = new Set<string>()
  while (stack.length) {
    const c = stack.pop()!
    if (c === source) return true
    if (seen.has(c)) continue
    seen.add(c)
    edges.filter(e => e.source === c).forEach(e => stack.push(e.target))
  }
  return false
}

export async function runGraph(nodes: OpNodeT[], edges: DataEdgeT[], onProgress?: (id: string, r: Result) => void): Promise<Record<string, Result>> {
  const memo = new Map<string, Promise<Result>>()
  const byId = new Map(nodes.map(n => [n.id, n]))
  const evalNode = (id: string): Promise<Result> => {
    let p = memo.get(id)
    if (p) return p
    p = (async () => {
      const n = byId.get(id)!
      const info = opInfo(n.data.op)
      const ins: (Result | null)[] = []
      for (let i = 0; i < Math.max(1, info.inputs); i++) {
        const e = edges.find(e => e.target === id && inPort(e) === i)
        if (!e || !byId.has(e.source)) { ins.push(null); continue }
        try { ins.push(await evalNode(e.source)) } catch { throw new Error('Hay un error en un bloque anterior') }
      }
      if (info.inputs === 0) ins.length = 0
      const key = JSON.stringify([n.data.op, n.data.args ?? n.data.params]) + '|' + ins.map(r => r?.serial ?? '-').join(',')
      const c = cache.get(id)
      if (c && c.key === key) return c.res
      const res = await execNode(n, ins)
      cache.set(id, { key, res })
      return res
    })()
    memo.set(id, p)
    return p
  }
  const out: Record<string, Result> = {}
  await Promise.all(nodes.map(async n => {
    try { out[n.id] = await evalNode(n.id) }
    catch (e: any) { out[n.id] = { ok: false, err: e?.message ?? String(e), serial: ++serial } }
    onProgress?.(n.id, out[n.id])
  }))
  return out
}

export { isCustom }
