// Aplicar una propuesta de la IA paso a paso (como «Keep» por cambio en Copilot Edits): se
// divide en pasos (añadir, cambiar o quitar un bloque) en orden de dependencias, y el flujo
// parcial de cada paso usa la versión nueva de lo ya aplicado y la anterior de lo demás.
import type { AIBlock, AIFlow, AILink } from './flowSpec'

export interface ApplyStep { key: string; kind: 'add' | 'change' | 'remove'; op: string }

/** ¿Dos versiones de un bloque son iguales? (la app compara con los valores por defecto aplicados). */
export type SameBlock = (a: AIBlock, b: AIBlock) => boolean

const incoming = (f: AIFlow, key: string) =>
  f.links.filter(l => l.to === key).map(l => `${l.from}#${l.port}`).sort().join(',')

/** Claves del flujo en orden de dependencias (primero lo que alimenta a los demás). */
export function topoKeys(f: AIFlow): string[] {
  const keys = f.blocks.map(b => b.key)
  const indeg = new Map(keys.map(k => [k, 0]))
  f.links.forEach(l => indeg.set(l.to, (indeg.get(l.to) ?? 0) + 1))
  const out: string[] = []
  const ready = keys.filter(k => !indeg.get(k))
  while (ready.length) {
    const k = ready.shift()!
    out.push(k)
    for (const l of f.links.filter(l => l.from === k)) {
      indeg.set(l.to, indeg.get(l.to)! - 1)
      if (!indeg.get(l.to)) ready.push(l.to)
    }
  }
  return [...out, ...keys.filter(k => !out.includes(k))]
}

/** Cambios de `before` a `final`: bloques nuevos o distintos (parámetros o cables de entrada) y quitados. */
export function planSteps(final: AIFlow, before: AIFlow | null, same: SameBlock): ApplyStep[] {
  const prev = new Map((before?.blocks ?? []).map(b => [b.key, b]))
  const byKey = new Map(final.blocks.map(b => [b.key, b]))
  const steps: ApplyStep[] = []
  for (const key of topoKeys(final)) {
    const b = byKey.get(key)!, p = prev.get(key)
    if (!p) steps.push({ key, kind: 'add', op: b.op })
    else if (!same(p, b) || incoming(final, key) !== incoming(before!, key)) steps.push({ key, kind: 'change', op: b.op })
  }
  for (const p of before?.blocks ?? []) if (!byKey.has(p.key)) steps.push({ key: p.key, kind: 'remove', op: p.op })
  return steps
}

/** Flujo tras aplicar los `n` primeros pasos. Con todos los pasos es el flujo final. */
export function partialFlow(final: AIFlow, before: AIFlow | null, steps: ApplyStep[], n: number): AIFlow {
  const done = new Set(steps.slice(0, n).map(s => s.key))
  const pending = new Set(steps.slice(n).map(s => s.key))
  const prev = new Map((before?.blocks ?? []).map(b => [b.key, b]))
  // Versión final: lo aplicado y lo que no cambia. Versión anterior: lo pendiente que ya existía.
  const blocks: { b: AIBlock; fromFinal: boolean }[] = []
  for (const b of final.blocks) {
    if (!pending.has(b.key)) blocks.push({ b, fromFinal: true })
    else if (prev.has(b.key)) blocks.push({ b: prev.get(b.key)!, fromFinal: false })
  }
  for (const p of before?.blocks ?? []) {
    if (!final.blocks.some(b => b.key === p.key) && !done.has(p.key)) blocks.push({ b: p, fromFinal: false })
  }
  const present = new Set(blocks.map(x => x.b.key))
  const links: AILink[] = []
  for (const { b, fromFinal } of blocks) {
    const src = fromFinal ? final : before!
    for (const l of src.links) if (l.to === b.key && present.has(l.from)) links.push(l)
  }
  return { title: final.title, blocks: blocks.map(x => x.b), links, checks: [] }
}
