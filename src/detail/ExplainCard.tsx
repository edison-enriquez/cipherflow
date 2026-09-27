import { useEffect, useState, type ReactNode } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { useAgentStore } from '../agent/config'
import { completeLLM } from '../agent/llm'
import { explainNode, type Explanation } from '../agent/explain'
import { explainContext } from '../agent/runtime'
import type { OpNodeT, Result } from '../engine/types'

// Explicaciones ya pedidas (por bloque y resultado) para no repetir llamadas al reabrir el detalle
const cache = new Map<string, Explanation>()

/** Resalta las citas verificadas contra los datos del bloque y tacha las que no aparecen en ellos. */
export function highlight(text: string, cites: string[], rejected: string[]): ReactNode[] {
  const bad = new Set(rejected.map(r => r.toLowerCase()))
  const list = [...new Set([...cites, ...rejected])].filter(c => c.length > 1).sort((a, b) => b.length - a.length)
  if (!list.length) return [text]
  const re = new RegExp(`(${list.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return text.split(re).map((p, i) => i % 2 === 0 ? p
    : bad.has(p.toLowerCase())
      ? <span key={i} className="text-red line-through decoration-red/70" title="Valor no verificado: no aparece en los datos de este bloque">{p}</span>
      : <mark key={i} className="rounded bg-yellow/25 px-0.5 text-text">{p}</mark>)
}

export default function ExplainCard({ node, res, input }: { node: OpNodeT; res?: Result; input?: Result }) {
  const config = useAgentStore(s => s.config)
  const key = `${node.id}:${res?.serial ?? '-'}`
  const [state, setState] = useState<{ loading: boolean; value?: Explanation | null; error?: string }>(() => cache.has(key) ? { loading: false, value: cache.get(key) } : { loading: true })

  useEffect(() => {
    if (cache.has(key)) { setState({ loading: false, value: cache.get(key) }); return }
    const ctl = new AbortController()
    setState({ loading: true })
    explainNode(explainContext(node, res, input), config, completeLLM, ctl.signal)
      .then(v => { if (v) cache.set(key, v); setState({ loading: false, value: v, error: v ? undefined : 'No se pudo obtener una explicación fiable. Inténtalo de nuevo.' }) })
      .catch(e => { if (e?.name !== 'AbortError') setState({ loading: false, error: e?.message ?? String(e) }) })
    return () => ctl.abort()
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="mb-6 max-w-[1100px] rounded border border-purple/35 bg-purple/5 p-3.5" aria-live="polite">
      <h3 className="label mb-2 flex items-center gap-1.5 text-purple"><Sparkles size={12} /> Explicación de la IA</h3>
      {state.loading ? <p className="flex items-center gap-2 text-[13px] text-muted"><Loader2 size={13} className="animate-spin" /> Analizando los datos de este bloque…</p>
        : state.error ? <p className="text-[13px] text-red">{state.error}</p>
        : state.value && (
          <>
            <p className="text-[13px] leading-relaxed">{highlight(state.value.text, state.value.citations, state.value.rejected)}</p>
            <p className="mt-2 text-[10.5px] text-muted">
              Solo se resaltan valores que existen en la entrada, la salida o los parámetros de este bloque.
              {state.value.rejected.length > 0 && ` Tachado: ${state.value.rejected.length} valor(es) que la IA mencionó pero no aparecen en los datos; no los tomes como reales.`}
            </p>
          </>
        )}
    </section>
  )
}
