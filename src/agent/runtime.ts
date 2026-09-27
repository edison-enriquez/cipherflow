// Puente entre el agente y la app: catálogo real, ejecución de flujos candidatos en el motor
// (fuera del lienzo) y contexto de un bloque para «Explicar».
import { defaultArgs, namedArgs, opConfig } from '../engine/cyberchef'
import { EXCLUDED, buildCatalog, customDefaults, isCustom, opInfo, type CustomOp } from '../engine/catalog'
import { inPort, runGraph } from '../engine/graph'
import { buildFlow } from '../io'
import { fromUtf8, isPrintable, toHex } from '../lib/bytes'
import type { DataEdgeT, OpNodeT, Result } from '../engine/types'
import { edgeId } from '../state/store'
import { layoutFlow, type AIBlock, type AIFlow } from './flowSpec'
import { engineCatalog, type Catalog } from './catalog'
import type { ExecuteFn, NodeOutcome } from './flowAgent'
import { corpusOf, type ExplainContext } from './explain'
import type { SameBlock } from './steps'

let cat: Catalog | null = null
export function catalog(): Catalog {
  if (!cat) {
    const all = () => [...new Set(buildCatalog().slice(2).flatMap(c => c.ops))].filter(o => !EXCLUDED.has(o))
    cat = engineCatalog(opConfig, opInfo, all)
  }
  return cat
}

export const resultText = (r?: Result) => !r?.ok || !r.bytes ? '' : isPrintable(r.bytes) ? fromUtf8(r.bytes) : toHex(r.bytes, ' ')

/** Ejecuta un flujo candidato con el motor de CyberChef y devuelve el resultado por key. */
export const executeFlow: ExecuteFn = async spec => {
  const { nodes, edges, map } = buildFlow(spec)
  const r = await runGraph(nodes, edges)
  const out: Record<string, NodeOutcome> = {}
  for (const [key, id] of Object.entries(map)) {
    const x = r[id]
    out[key] = x?.ok ? { ok: true, text: resultText(x) } : { ok: false, err: x?.err ?? 'Sin resultado' }
  }
  return out
}

/** Datos reales de un bloque para que el modelo los explique. */
export function explainContext(node: OpNodeT, res: Result | undefined, input: Result | undefined): ExplainContext {
  const info = opInfo(node.data.op)
  const cfg = opConfig(node.data.op)
  const params: Record<string, unknown> = {}
  if (cfg) cfg.args.forEach((a, i) => { if (a.type !== 'label') params[a.name] = node.data.args?.[i] })
  else Object.assign(params, node.data.params)
  return {
    op: info.name, category: info.cat, description: info.desc.slice(0, 400), params,
    inputText: resultText(input), outputText: resultText(res), error: res && !res.ok ? res.err : undefined,
  }
}


// ── Flujo abierto como contexto ────────────────────────────────────────────────
const KEEP = /^⟨conservar:([\w-]+)⟩$/
const LONG = 300

export interface CurrentFlow {
  /** JSON del flujo abierto en el formato del agente (lo ve el modelo). */
  json: string
  /** Salidas actuales, resumidas, para que el modelo sepa qué produce hoy. */
  outputs: string[]
  /** Devuelve los datos largos que se abreviaron y los parámetros que el modelo no ve (archivos). */
  expand: (f: AIFlow) => AIFlow
  /** key del agente → id del nodo en el lienzo */
  ids: Record<string, string>
  nodes: OpNodeT[]
}

/** Traduce el lienzo al formato del agente (keys b1, b2…; solo parámetros distintos del valor por defecto). */
export function describeCurrent(nodes: OpNodeT[], edges: DataEdgeT[], results: Record<string, Result>): CurrentFlow {
  const cat = catalog()
  const keyOf = new Map<string, string>(), ids: Record<string, string> = {}
  nodes.forEach((n, i) => { const k = 'b' + (i + 1); keyOf.set(n.id, k); ids[k] = n.id })
  const orig = new Map<string, Record<string, any>>()
  const blocks = nodes.map(n => {
    const key = keyOf.get(n.id)!
    const op = n.data.op
    if (op.startsWith('__')) {
      const known = new Set(cat.get(op)?.args.map(a => a.name))
      const params: Record<string, any> = {}
      for (const [k, v] of Object.entries(n.data.params ?? {})) if (known.has(k)) params[k] = v
      if (op === '__input') {
        orig.set(key, { ...n.data.params })
        if (n.data.params?.file || String(params.text ?? '').length > LONG) params.text = `⟨conservar:${key}⟩`
      }
      return { key, op, params }
    }
    const cfg = opConfig(op), def = defaultArgs(op), args: Record<string, any> = {}
    cfg?.args.forEach((a, i) => { if (a.type !== 'label' && JSON.stringify(n.data.args?.[i]) !== JSON.stringify(def[i])) args[a.name] = n.data.args?.[i] })
    return { key, op, args }
  })
  const links = edges.filter(e => keyOf.has(e.source) && keyOf.has(e.target))
    .map(e => [keyOf.get(e.source)!, keyOf.get(e.target)!, inPort(e)])
  const outputs = nodes.filter(n => n.data.op === '__output').map(n => {
    const r = results[n.id], t = r?.ok ? resultText(r) : r ? 'ERROR ' + r.err : '(sin ejecutar)'
    return `- ${keyOf.get(n.id)} «${n.data.params?.label || 'Salida'}»: ${JSON.stringify(t.slice(0, 120))}`
  })
  return {
    json: JSON.stringify({ blocks, links }), outputs, ids, nodes,
    expand: f => ({
      ...f,
      blocks: f.blocks.map(b => {
        if (b.op !== '__input') return b
        const m = KEEP.exec(String(b.params?.text ?? ''))
        const src = orig.get(m?.[1] ?? (ids[b.key] ? b.key : ''))
        if (!src) return b
        return { ...b, params: { ...src, ...b.params, ...(m ? { text: src.text } : {}) } }
      }),
    }),
  }
}

/** Lleva el flujo del agente al lienzo reutilizando los nodos existentes (mismo id y posición). */
export function applyToCanvas(f: AIFlow, cur: CurrentFlow): { nodes: OpNodeT[]; edges: DataEdgeT[]; ids: Record<string, string> } {
  const { nodes, map } = buildFlow(layoutFlow(f))
  const prev = new Map(cur.nodes.map(n => [n.id, n]))
  const idOf: Record<string, string> = {}
  const keyByNew = new Map(Object.entries(map).map(([k, id]) => [id, k]))
  const out = nodes.map(n => {
    const key = keyByNew.get(n.id)!
    const old = cur.ids[key] && prev.get(cur.ids[key])
    const reuse = old && old.data.op === n.data.op
    idOf[key] = reuse ? old.id : n.id
    return reuse ? { ...n, id: old.id, position: old.position } : n
  })
  // Los bloques nuevos van a la derecha de quien los alimenta, sin pisar a nadie
  const placed = out.filter(n => prev.has(n.id))
  for (const n of out) {
    if (prev.has(n.id)) continue
    const key = keyByNew.get(n.id)!
    const from = f.links.find(l => l.to === key && placed.some(p => p.id === idOf[l.from]))
    if (from) {
      const src = out.find(x => x.id === idOf[from.from])!
      const pos = { x: src.position.x + 340, y: src.position.y }
      while (placed.some(p => Math.abs(p.position.x - pos.x) < 300 && Math.abs(p.position.y - pos.y) < 180)) pos.y += 230
      n.position = pos
    } else if (placed.length) {
      n.position = { x: n.position.x, y: Math.max(...placed.map(p => p.position.y)) + 260 + n.position.y }
    }
    placed.push(n)
  }
  const edges = f.links.map(l => {
    const source = idOf[l.from], target = idOf[l.to], h = 'in' + l.port
    return { id: edgeId(source, target, h), source, target, sourceHandle: 'out', targetHandle: h, type: 'data' as const }
  })
  return { nodes: out, edges, ids: idOf }
}

// ── Chat: comparar versiones, flujo actual y contexto para preguntas ────────────
/** ¿Dos versiones de un bloque son iguales? Compara con los valores por defecto aplicados. */
export const sameBlock: SameBlock = (a, b) => {
  if (a.op !== b.op) return false
  if (isCustom(a.op)) {
    const d = customDefaults(a.op as CustomOp) ?? {}
    const pick = (p?: Record<string, any>) => { const x = { ...d, ...p }; return JSON.stringify(Object.keys(x).sort().map(k => [k, x[k] ?? null])) }
    return pick(a.params) === pick(b.params)
  }
  return JSON.stringify(namedArgs(a.op, a.args ?? {})) === JSON.stringify(namedArgs(b.op, b.args ?? {}))
}

/** El flujo abierto en el formato del agente, con los datos largos ya restituidos. */
export function currentAsFlow(cur: CurrentFlow): AIFlow {
  const j = JSON.parse(cur.json) as { blocks: AIBlock[]; links: [string, string, number][] }
  return cur.expand({ title: '', blocks: j.blocks, links: j.links.map(([from, to, port]) => ({ from, to, port })), checks: [] })
}

export interface AskContext { subject: 'bloque' | 'flujo'; label: string; context: string; corpus: string }

/** Datos reales de un bloque del lienzo, para preguntarle a la IA sobre él. */
export function blockAskContext(nodeId: string, nodes: OpNodeT[], edges: DataEdgeT[], results: Record<string, Result>): AskContext | null {
  const node = nodes.find(n => n.id === nodeId)
  if (!node) return null
  const e = edges.find(x => x.target === nodeId && inPort(x) === 0)
  const ctx = explainContext(node, results[nodeId], e ? results[e.source] : undefined)
  const clip = (s: string) => (s.length > 700 ? s.slice(0, 700) + ` … (${s.length - 700} caracteres más)` : s)
  return {
    subject: 'bloque', label: ctx.op,
    context: `Operación: ${ctx.op} (${ctx.category})\nQué hace: ${ctx.description}\nParámetros: ${JSON.stringify(ctx.params)}\n` +
      `Entrada: ${clip(ctx.inputText || '(vacía)')}\n${results[nodeId] ? (ctx.error ? `ERROR: ${ctx.error}` : `Salida: ${clip(ctx.outputText || '(vacía)')}`) : 'Aún no se ha ejecutado.'}`,
    corpus: corpusOf(ctx),
  }
}

/** El flujo abierto (bloques, cables y salidas actuales), para preguntar sobre él en conjunto. */
export function flowAskContext(cur: CurrentFlow, name: string): AskContext {
  const context = `Flujo «${name}» (keys b1, b2…; solo aparecen los parámetros distintos del valor por defecto):\n${cur.json}\n` +
    (cur.outputs.length ? `Salidas actuales:\n${cur.outputs.join('\n')}` : 'Sin salidas.')
  return { subject: 'flujo', label: name, context, corpus: context }
}
