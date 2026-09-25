import { useState } from 'react'
import { ChevronDown, Github, Lightbulb, Target, X } from 'lucide-react'
import type { Lab } from '../labs'

const DIFF_COLOR: Record<string, string> = { 'Básico': 'green', 'Intermedio': 'yellow', 'Avanzado': 'red' }

/** Consigna del laboratorio: objetivo, reto, pistas desplegables y criterio de éxito. */
export default function LabBrief({ lab, onClose }: { lab: Lab; onClose: () => void }) {
  const [showHints, setShowHints] = useState(false)
  const repo = 'https://github.com/edison-enriquez/cipherflow/blob/main/' + lab.writeup
  const c = DIFF_COLOR[lab.dificultad] ?? 'muted'
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-base/70 p-4 backdrop-blur-[2px]" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby="lab-title" className="flex max-h-full w-[min(640px,100%)] animate-fade-in flex-col overflow-hidden rounded-lg border border-border bg-surface">
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0" style={{ background: `rgb(var(--c-${c}))` }} />
          <div className="min-w-0 flex-1">
            <p className="label" style={{ color: `rgb(var(--c-${c}))` }}>Laboratorio · {lab.dificultad}</p>
            <h2 id="lab-title" className="mt-0.5 text-lg font-bold leading-tight">{lab.titulo}</h2>
            <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted">{lab.vuln}</p>
          </div>
          <button className="btn btn-icon" onClick={onClose} aria-label="Cerrar"><X size={13} /></button>
        </header>
        <div className="space-y-4 overflow-y-auto px-5 py-4 text-[13px] leading-relaxed">
          <section>
            <h3 className="label mb-1 flex items-center gap-1.5"><Target size={12} /> Objetivo</h3>
            <p>{lab.objetivo}</p>
          </section>
          <section className="rounded border border-green/30 bg-green/5 p-3">
            <h3 className="label mb-1 text-green">El reto</h3>
            <p>{lab.reto}</p>
          </section>
          <section>
            <button className="label flex items-center gap-1.5 hover:text-green" onClick={() => setShowHints(v => !v)} aria-expanded={showHints}>
              <Lightbulb size={12} /> Pistas ({lab.pistas.length}) <ChevronDown size={12} className={showHints ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>
            {showHints && (
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-muted">
                {lab.pistas.map((h, i) => <li key={i}>{h}</li>)}
              </ol>
            )}
          </section>
          <section className="border-t border-border pt-3">
            <h3 className="label mb-1">Lo lograste cuando…</h3>
            <p className="text-muted">{lab.criterio}</p>
          </section>
        </div>
        <footer className="flex items-center gap-2 border-t border-border px-5 py-3">
          <a className="btn" href={repo} target="_blank" rel="noreferrer"><Github size={13} /> Ver solución (writeup)</a>
          <button className="btn btn-primary ml-auto" onClick={onClose}>Al lienzo →</button>
        </footer>
      </div>
    </div>
  )
}
