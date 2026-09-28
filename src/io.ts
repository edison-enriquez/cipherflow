// Ejemplos, importación (flujos de CipherFlow y recetas de CyberChef) y exportación.
import { cyberChefArgs, defaultArgs, namedArgs, opConfig } from './engine/cyberchef'
import { EXCLUDED, customDefaults, isCustom } from './engine/catalog'
import { inPort } from './engine/graph'
import { edgeId } from './state/store'
import { serializeGraph, type SavedGraph } from './state/runner'
import type { DataEdgeT, OpNodeT } from './engine/types'
import { EXAMPLES, type Spec } from './examples'

export type { Spec }

const uid = () => 'n' + Math.random().toString(36).slice(2, 9)
const mkEdge = (source: string, target: string, port = 0): DataEdgeT =>
  ({ id: edgeId(source, target, 'in' + port), source, target, sourceHandle: 'out', targetHandle: 'in' + port, type: 'data' })

function mkNode(op: string, x: number, y: number, args?: Record<string, any>, id = uid()): OpNodeT {
  const data = isCustom(op) ? { op, params: { ...customDefaults(op), ...(args ?? {}) } } : { op, args: args ? namedArgs(op, args) : defaultArgs(op) }
  return { id, type: 'op', position: { x, y }, data }
}

export interface FlowSpec { n: Spec; e: [string, string, number?][] }

/** Construye nodos y aristas a partir de una especificación compacta; devuelve también el mapa de claves. */
export function buildFlow(spec: FlowSpec) {
  const map: Record<string, string> = {}
  const nodes: OpNodeT[] = []
  for (const [k, op, x, y, args] of spec.n) {
    if (!isCustom(op) && !opConfig(op)) continue
    const n = mkNode(op, x, y, args)
    map[k] = n.id
    nodes.push(n)
  }
  const edges = spec.e.filter(([a, b]) => map[a] && map[b]).map(([a, b, p]) => mkEdge(map[a], map[b], p ?? 0))
  return { nodes, edges, map }
}

export function buildExample(name: string) {
  const ex = EXAMPLES[name]
  const { nodes, edges, map } = buildFlow(ex)
  return { nodes, edges, open: ex.open ? map[ex.open] : undefined }
}

export function graphFromSaved(g: SavedGraph) {
  const nodes: OpNodeT[] = g.nodes.filter(n => isCustom(n.op) || opConfig(n.op)).map(n => {
    const base = mkNode(n.op, n.x, n.y, undefined, String(n.id))
    if (isCustom(n.op)) base.data.params = { ...base.data.params, ...(n.params ?? {}) }
    else if (Array.isArray(n.args)) n.args.forEach((v, i) => { if (i < base.data.args!.length && v !== undefined && v !== null) base.data.args![i] = v })
    return base
  })
  const ids = new Set(nodes.map(n => n.id))
  const edges = (g.edges ?? []).filter(e => ids.has(e.from) && ids.has(e.to)).map(e => mkEdge(e.from, e.to, e.port | 0))
  return { nodes, edges }
}

/** Convierte una receta de CyberChef ([{op, args}, …]) en una cadena de bloques. */
export function graphFromRecipe(recipe: { op: string; args?: any[] }[]) {
  const nodes: OpNodeT[] = [mkNode('__input', 0, 90)]
  const edges: DataEdgeT[] = []
  let x = 350, skipped = 0
  for (const st of recipe) {
    if (!opConfig(st.op) || EXCLUDED.has(st.op)) { skipped++; continue }
    const n = mkNode(st.op, x, 90)
    if (Array.isArray(st.args)) st.args.forEach((v, i) => { if (i < n.data.args!.length && v !== undefined) n.data.args![i] = v })
    edges.push(mkEdge(nodes[nodes.length - 1].id, n.id))
    nodes.push(n)
    x += 350
  }
  const out = mkNode('__output', x, 90)
  edges.push(mkEdge(nodes[nodes.length - 1].id, out.id))
  nodes.push(out)
  return { nodes, edges, skipped }
}

export function parseImport(text: string) {
  const j = JSON.parse(text.trim())
  if (Array.isArray(j)) return graphFromRecipe(j)
  return { ...graphFromSaved(j), skipped: 0 }
}

/** Receta de CyberChef que lleva hasta el bloque indicado (siguiendo siempre la entrada 1). */
export function recipeTo(id: string, nodes: OpNodeT[], edges: DataEdgeT[]) {
  const path: { op: string; args: any[] }[] = []
  let cur: string | undefined = id
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const n = nodes.find(m => m.id === cur)
    if (!n) break
    if (!isCustom(n.data.op)) {
      // Con el proxy activado se exporta la URL ya reescrita, que CyberChef entiende
      let args = n.data.args ?? []
      try { args = cyberChefArgs(n.data.op, args) } catch { /* se exporta tal cual */ }
      path.unshift({ op: n.data.op, args })
    }
    cur = edges.find(e => e.target === cur && inPort(e) === 0)?.source
  }
  return path
}

export const exportText = (nodes: OpNodeT[], edges: DataEdgeT[]) => JSON.stringify(serializeGraph(nodes, edges), null, 1)

/** Bloques pegados desde el portapapeles (flujo de CipherFlow o receta de CyberChef) con ids nuevos, listos para añadir al lienzo. */
export function parsePaste(text: string) {
  const g = parseImport(text)
  if (!g.nodes.length) throw new Error('vacío')
  const ids: Record<string, string> = {}
  const nodes = g.nodes.map(n => { ids[n.id] = uid(); return { ...n, id: ids[n.id], selected: true } })
  const edges = g.edges.map(e => mkEdge(ids[e.source], ids[e.target], Number(String(e.targetHandle).slice(2)) || 0))
  return { nodes, edges, skipped: g.skipped }
}
