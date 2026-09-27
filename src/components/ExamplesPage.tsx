import { useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, Globe, Search } from 'lucide-react'
import { EXAMPLE_GROUPS, LIVE_OPS, type Example, type ExampleGroup } from '../examples'
import { catColor, opInfo } from '../engine/catalog'
import { useFlows } from '../state/flows'
import { go } from '../router'
import { HomeTabs } from './FlowsPage'
import { Square, Tag, cssColor } from './ui'

const COLLAPSED_KEY = 'cipherflow.examples.collapsed'
const readCollapsed = (): string[] => { try { return JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]') } catch { return [] } }
const writeCollapsed = (ids: string[]) => { try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(ids)) } catch { /* sin almacenamiento */ } }

/** Operaciones de CyberChef que usa un ejemplo, sin repetir y sin los bloques de entrada y salida. */
const opsOf = (e: Example) => [...new Set(e.n.map(([, op]) => op).filter(op => op !== '__input' && op !== '__output'))]
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const TOTAL = EXAMPLE_GROUPS.reduce((s, g) => s + Object.keys(g.examples).length, 0)

/** Galería de ejemplos por grupo (#/ejemplos): tarjetas con qué enseña cada uno y qué operaciones usa. */
export default function ExamplesPage({ group, onOpen }: { group?: string; onOpen: (key: string) => void }) {
  const flows = useFlows()
  const [q, setQ] = useState('')
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed)
  const active = EXAMPLE_GROUPS.some(g => g.id === group) ? group : undefined

  // Ejemplos que el usuario ya modificó: se abren desde su flujo guardado
  const saved = useMemo(() => new Set((flows ?? []).filter(f => f.origin === 'example' && f.originKey).map(f => f.originKey!)), [flows])

  const shown = useMemo(() => {
    const t = norm(q.trim())
    return EXAMPLE_GROUPS.filter(g => !active || g.id === active).map(g => ({
      g,
      items: Object.entries(g.examples).filter(([k, e]) => !t || norm(k + ' ' + e.d + ' ' + opsOf(e).join(' ')).includes(t)),
    })).filter(x => x.items.length)
  }, [q, active])
  const count = shown.reduce((s, x) => s + x.items.length, 0)

  const toggle = (id: string) => setCollapsed(c => { const n = c.includes(id) ? c.filter(x => x !== id) : [...c, id]; writeCollapsed(n); return n })
  const pick = (id?: string) => go(id ? { view: 'examples', group: id } : { view: 'examples' }, true)

  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-5">
          <h1 className="text-xl font-bold">Ejemplos</h1>
          <p className="mt-1 text-xs text-muted">{TOTAL} flujos listos para abrir, en {EXAMPLE_GROUPS.length} grupos. Cámbiales lo que quieras: al modificarlos se guardan en «Mis flujos».</p>
        </div>
        <HomeTabs active="examples" />

        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="field-input pl-8" type="search" placeholder="Buscar por tema u operación (AES, DNS, Base64…)" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar ejemplos" />
          </div>
        </div>
        <div className="scroll-row -mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filtrar por grupo">
          <button className={`btn shrink-0 ${!active ? 'btn-on' : ''}`} aria-pressed={!active} onClick={() => pick()}>Todos <span className="opacity-70">{TOTAL}</span></button>
          {EXAMPLE_GROUPS.map(g => (
            <button key={g.id} className={`btn shrink-0 ${active === g.id ? 'btn-on' : ''}`} aria-pressed={active === g.id} onClick={() => pick(active === g.id ? undefined : g.id)}>
              <Square color={g.color} />{g.title} <span className="opacity-70">{Object.keys(g.examples).length}</span>
            </button>
          ))}
        </div>

        {!count ? <p className="border border-dashed border-border p-8 text-center text-xs text-muted">Ningún ejemplo coincide con «{q}».</p> : (
          <div className="space-y-6">
            {shown.map(({ g, items }) => {
              // Al buscar o filtrar por un grupo, todo queda desplegado
              const open = !!q.trim() || !!active || !collapsed.includes(g.id)
              return (
                <section key={g.id} aria-labelledby={`grupo-${g.id}`}>
                  <button className="group flex w-full items-start gap-3 border-b border-border pb-2 text-left" onClick={() => toggle(g.id)} aria-expanded={open} disabled={!!q.trim() || !!active}>
                    <span className="mt-1.5"><Square color={g.color} size={10} /></span>
                    <span className="min-w-0 flex-1">
                      <span id={`grupo-${g.id}`} className="flex items-baseline gap-2">
                        <span className="text-[15px] font-bold group-enabled:group-hover:text-green">{g.title}</span>
                        <span className="text-[11px] text-muted">{items.length} {items.length === 1 ? 'ejemplo' : 'ejemplos'}</span>
                      </span>
                      <span className="mt-0.5 block text-[12px] text-muted">{g.desc}</span>
                    </span>
                    {!q.trim() && !active && <ChevronDown size={15} className={`mt-1 shrink-0 text-muted transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />}
                  </button>
                  {open && (
                    <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map(([k, e]) => <ExampleCard key={k} name={k} ex={e} group={g} saved={saved.has(k)} onOpen={() => onOpen(k)} />)}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function ExampleCard({ name, ex, group, saved, onOpen }: { name: string; ex: Example; group: ExampleGroup; saved: boolean; onOpen: () => void }) {
  const ops = opsOf(ex)
  const live = ops.some(op => LIVE_OPS.has(op))
  const MAX = 4
  return (
    <li>
      <button
        className="group flex h-full w-full flex-col border border-border bg-base p-3 text-left transition-colors hover:border-green/50 hover:bg-surface focus-visible:border-green/50"
        style={{ borderLeft: `3px solid ${cssColor(group.color)}` }}
        onClick={onOpen}
      >
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1 text-[13.5px] font-bold leading-snug group-hover:text-green">{name}</span>
          {live && <span className="flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-wider text-cyan" title="Hace peticiones reales a Internet"><Globe size={11} /> En vivo</span>}
        </span>
        <span className="mt-1.5 line-clamp-3 text-[12px] leading-relaxed text-muted">{ex.d}</span>
        <span className="mt-2.5 flex flex-wrap gap-1">
          {ops.slice(0, MAX).map(op => { const i = opInfo(op); return <Tag key={op} color={catColor(i.cat)}>{i.name}</Tag> })}
          {ops.length > MAX && <span className="text-[10.5px] leading-[1.6] text-muted">+{ops.length - MAX}</span>}
        </span>
        <span className="mt-auto flex items-center gap-2 pt-3 text-[11px] text-muted">
          <span>{ex.n.length} bloques</span>
          {saved && <span className="text-green">· con tus cambios</span>}
          <span className="ml-auto flex items-center gap-1 uppercase tracking-wider group-hover:text-green">Abrir <ArrowRight size={12} /></span>
        </span>
      </button>
    </li>
  )
}
