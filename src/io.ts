// Ejemplos, importación (flujos de CipherFlow y recetas de CyberChef) y exportación.
import { defaultArgs, namedArgs, opConfig } from './engine/cyberchef'
import { EXCLUDED, customDefaults, isCustom } from './engine/catalog'
import { inPort } from './engine/graph'
import { edgeId } from './state/store'
import { serializeGraph, type SavedGraph } from './state/runner'
import type { DataEdgeT, OpNodeT } from './engine/types'

export type Spec = [key: string, op: string, x: number, y: number, args?: Record<string, any>][]
interface Example { n: Spec; e: [string, string, number?][]; open?: string }

const K16 = { string: '000102030405060708090a0b0c0d0e0f', option: 'Hex' }
const IV16 = { string: '0f0e0d0c0b0a09080706050403020100', option: 'Hex' }

export const EXAMPLES: Record<string, Example> = {
  'AES-CBC por dentro': {
    n: [['a', '__input', 0, 90, { text: 'Hola Juan, esto es AES-CBC!' }], ['b', 'AES Encrypt', 330, 90, { Key: K16, IV: IV16, Mode: 'CBC', Input: 'Raw', Output: 'Hex' }],
      ['c', '__output', 680, 0, { label: 'Cifrado (hex)' }], ['d', 'AES Decrypt', 680, 200, { Key: K16, IV: IV16, Mode: 'CBC', Input: 'Hex', Output: 'Raw' }], ['e', '__output', 1030, 200, { label: 'Descifrado' }]],
    e: [['a', 'b'], ['b', 'c'], ['b', 'd'], ['d', 'e']], open: 'b',
  },
  'ECB revela patrones': {
    n: [['a', '__input', 0, 100, { text: 'BLOQUE-REPETIDO!BLOQUE-REPETIDO!BLOQUE-REPETIDO!' }], ['b', 'AES Encrypt', 330, 0, { Key: K16, IV: IV16, Mode: 'ECB', Input: 'Raw', Output: 'Hex' }],
      ['c', '__output', 680, 0, { label: 'ECB: bloques iguales' }], ['d', 'AES Encrypt', 330, 220, { Key: K16, IV: IV16, Mode: 'CBC', Input: 'Raw', Output: 'Hex' }], ['e', '__output', 680, 220, { label: 'CBC: bloques distintos' }]],
    e: [['a', 'b'], ['b', 'c'], ['a', 'd'], ['d', 'e']], open: 'b',
  },
  'Base64 bit a bit': {
    n: [['a', '__input', 0, 90, { text: 'Hola!' }], ['b', 'To Binary', 330, 0], ['c', '__output', 680, 0, { label: 'Bits' }], ['d', 'To Base64', 330, 200], ['e', 'From Base64', 680, 200], ['f', '__output', 1030, 200, { label: 'De vuelta' }]],
    e: [['a', 'b'], ['b', 'c'], ['a', 'd'], ['d', 'e'], ['e', 'f']], open: 'd',
  },
  'SHA-256 y HMAC': {
    n: [['a', '__input', 0, 90, { text: 'abc' }], ['b', 'SHA2', 330, 0, { Size: '256' }], ['c', '__output', 680, 0, { label: 'SHA-256' }],
      ['d', 'HMAC', 330, 200, { Key: { string: 'clave-secreta', option: 'UTF8' }, 'Hashing function': 'SHA256' }], ['e', '__output', 680, 200, { label: 'HMAC-SHA256' }]],
    e: [['a', 'b'], ['b', 'c'], ['a', 'd'], ['d', 'e']], open: 'b',
  },
  'XOR ida y vuelta': {
    n: [['a', '__input', 0, 90, { text: 'Ataque al amanecer' }], ['b', 'XOR', 330, 90, { Key: { string: 'CLAVE', option: 'UTF8' } }], ['c', 'To Hex', 680, 0], ['d', '__output', 1030, 0, { label: 'Cifrado (hex)' }],
      ['e', 'XOR', 680, 200, { Key: { string: 'CLAVE', option: 'UTF8' } }], ['f', '__output', 1030, 200, { label: 'Recuperado' }]],
    e: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['b', 'e'], ['e', 'f']], open: 'b',
  },
  'One-time pad con dos flujos': {
    n: [['a', '__input', 0, 0, { text: 'Ataque al amanecer' }], ['r', 'Pseudo-Random Number Generator', 0, 220, { 'Number of bytes': 18, 'Output as': 'Raw' }], ['x', '__xor2', 330, 100],
      ['h', 'To Hex', 680, 0], ['o', '__output', 1030, 0, { label: 'Cifrado (hex)' }], ['y', '__xor2', 680, 220], ['p', '__output', 1030, 220, { label: 'Recuperado' }]],
    e: [['a', 'x', 0], ['r', 'x', 1], ['x', 'h'], ['h', 'o'], ['x', 'y', 0], ['r', 'y', 1], ['y', 'p']],
  },
  'Magic: descubrir la codificación': {
    n: [['a', '__input', 0, 90, { text: 'NTM2NTYzNzI2NTc0NmYyMDY0NjU2YzIwNmM2MTYyNmY3MjYxNzQ2ZjcyNjk2Zg==' }], ['b', 'Magic', 330, 90], ['c', '__output', 680, 90, { label: 'Sugerencias' }]],
    e: [['a', 'b'], ['b', 'c']], open: 'b',
  },
  'Clásicos: ROT13 y Vigenère': {
    n: [['a', '__input', 0, 90, { text: 'Ataca al amanecer' }], ['b', 'ROT13', 330, 0], ['c', '__output', 680, 0, { label: 'ROT13' }],
      ['d', 'Vigenère Encode', 330, 200, { Key: 'LIMON' }], ['e', 'Vigenère Decode', 680, 200, { Key: 'LIMON' }], ['f', '__output', 1030, 200, { label: 'Vigenère ida y vuelta' }]],
    e: [['a', 'b'], ['b', 'c'], ['a', 'd'], ['d', 'e'], ['e', 'f']], open: 'd',
  },
}

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
    if (!isCustom(n.data.op)) path.unshift({ op: n.data.op, args: n.data.args ?? [] })
    cur = edges.find(e => e.target === cur && inPort(e) === 0)?.source
  }
  return path
}

export const exportText = (nodes: OpNodeT[], edges: DataEdgeT[]) => JSON.stringify(serializeGraph(nodes, edges), null, 1)
