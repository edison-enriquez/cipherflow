import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { EXPLAINED, buildCatalog, catColor, opInfo } from '../engine/catalog'
import { opDownloadSize } from '../engine/cyberchef'
import { fmtSize } from '../lib/bytes'
import { Square } from './ui'

interface Props { onAdd: (op: string) => void; open: boolean; onClose: () => void }

export default function Palette({ onAdd, open, onClose }: Props) {
  const cats = buildCatalog()
  const [q, setQ] = useState('')
  const [openCats, setOpenCats] = useState<Set<string>>(() => new Set(['Flujo', 'Más usadas']))
  const total = useMemo(() => new Set(cats.slice(2).flatMap(c => c.ops)).size, [cats])

  const hits = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return null
    const seen = new Set<string>(), out: string[] = []
    for (const c of cats) for (const op of c.ops) {
      if (seen.has(op)) continue
      seen.add(op)
      const i = opInfo(op)
      if ((i.name + ' ' + i.desc).toLowerCase().includes(s)) out.push(op)
    }
    return out.sort((a, b) => Number(opInfo(b).name.toLowerCase().includes(s)) - Number(opInfo(a).name.toLowerCase().includes(s)))
  }, [q, cats])

  const Item = ({ op }: { op: string }) => {
    const i = opInfo(op)
    const kb = i.custom ? 0 : opDownloadSize(op)
    return (
      <button
        className="group flex w-full items-baseline gap-1.5 border-l border-transparent py-1 pl-6 pr-2 text-left text-[12.5px] hover:border-green hover:bg-surface hover:text-green"
        title={i.desc + (kb > 20000 ? `\nDescarga al usarla: ${fmtSize(kb)}` : '')}
        onClick={() => onAdd(op)}
      >
        <span className="truncate">{i.name}</span>
        {EXPLAINED.has(op) && <span className="text-[10.5px] text-yellow" title="Con explicación interna paso a paso">★</span>}
      </button>
    )
  }

  return (
    <aside className={`absolute inset-y-0 left-0 z-30 flex w-[min(88vw,300px)] flex-col border-r border-border bg-base transition-transform md:static md:z-auto md:w-[268px] md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center gap-2 p-3 pb-1.5">
        <div className="relative flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="field-input pl-8" type="search" placeholder="Buscar operación…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar operación" />
        </div>
        <button className="btn btn-icon md:hidden" onClick={onClose} aria-label="Cerrar la lista"><X size={13} /></button>
      </div>
      <p className="px-3.5 pb-2 text-[10.5px] uppercase tracking-wider text-muted">
        {hits ? `${hits.length} resultado${hits.length === 1 ? '' : 's'}` : `${total} operaciones de CyberChef + 4 de flujo`}
      </p>
      <nav className="flex-1 overflow-y-auto px-1.5 pb-3">
        {hits ? (
          hits.length ? hits.slice(0, 80).map(op => <Item key={op} op={op} />) : (
            <p className="p-3 text-xs text-muted">Ninguna operación coincide. Prueba con el nombre en inglés, como en CyberChef: «base64», «aes», «hash».</p>
          )
        ) : cats.map(c => {
          const isOpen = openCats.has(c.name)
          return (
            <div key={c.name}>
              <button
                className="flex w-full items-center gap-2.5 border-t border-border px-2 py-2.5 text-left text-[11px] font-bold uppercase tracking-widest hover:text-green"
                aria-expanded={isOpen}
                onClick={() => setOpenCats(s => { const n = new Set(s); isOpen ? n.delete(c.name) : n.add(c.name); return n })}
              >
                <Square color={catColor(c.name)} />
                <span className="flex-1">{c.name}</span>
                <span className="font-normal tracking-normal text-muted">{isOpen ? '▾' : '▸'} {c.ops.length}</span>
              </button>
              {isOpen && c.ops.map(op => <Item key={op} op={op} />)}
            </div>
          )
        })}
      </nav>
      <p className="border-t border-border px-3.5 py-2.5 text-[10.5px] leading-relaxed text-muted">
        <span className="text-yellow">★</span> con explicación interna paso a paso. Cada operación se descarga la primera vez que la usas.<br />
        Operaciones de CyberChef (GCHQ, © Crown Copyright). Licencia Apache 2.0.
      </p>
    </aside>
  )
}
