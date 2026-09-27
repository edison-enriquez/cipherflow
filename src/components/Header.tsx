import { useEffect, useRef, useState } from 'react'
import { BookOpen, Github, LayoutList, Menu, MoreVertical, Moon, Plus, Sparkles, Sun, Upload } from 'lucide-react'
import { useAgentStore } from '../agent/config'
import { LABS } from '../labs'
import { Tag } from './ui'
import type { Theme } from '../hooks/useTheme'

interface Props {
  theme: Theme
  onToggleTheme: () => void
  onHome: () => void
  onExamples: () => void
  onLab: (id: string) => void
  onNew: () => void
  onImport: () => void
  onMenu: () => void
  /** Página de inicio visible (resalta su botón). */
  page: 'flows' | 'examples' | null
  showMenu: boolean
}

export default function Header({ theme, onToggleTheme, onHome, onExamples, onLab, onNew, onImport, onMenu, page, showMenu }: Props) {
  const aiOn = useAgentStore(s => s.enabled)
  const openAI = useAgentStore(s => s.setSettingsOpen)
  // En pantallas pequeñas, laboratorios, ejemplos, importar, tema y GitHub van en un menú «⋯»
  const [more, setMore] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!more) return
    const f = (e: PointerEvent) => { if (!moreRef.current?.contains(e.target as Node)) setMore(false) }
    document.addEventListener('pointerdown', f)
    return () => document.removeEventListener('pointerdown', f)
  }, [more])
  const labSelect = (cls: string) => (
    <select
      className={cls}
      value=""
      onChange={e => { if (e.target.value) { setMore(false); onLab(e.target.value) } }}
      aria-label="Cargar un laboratorio"
      title="Laboratorios de vulnerabilidades"
    >
      <option value="">Laboratorios</option>
      {Object.values(LABS).map(l => <option key={l.id} value={l.id}>{l.titulo}</option>)}
    </select>
  )
  const examplesButton = (cls: string) => (
    <button className={`${cls} ${page === 'examples' ? 'btn-on' : ''}`} onClick={() => { setMore(false); onExamples() }} title="Galería de ejemplos por tema">
      <BookOpen size={13} />Ejemplos
    </button>
  )
  return (
    <header className="z-20 flex h-12 shrink-0 items-center gap-1.5 sm:gap-2 border-b border-border bg-base px-3 sm:px-4">
      {showMenu && <button className="btn btn-icon md:hidden" onClick={onMenu} aria-label="Abrir el panel lateral"><Menu size={14} /></button>}
      <div className="mr-auto flex min-w-0 items-center gap-3 overflow-hidden">
        <button className="flex shrink-0 items-center gap-1.5 text-sm font-bold uppercase tracking-widest hover:text-green sm:text-[15px]" onClick={onHome} title="Mis flujos">
          <span className="inline-block h-2.5 w-2.5 bg-green" aria-hidden="true" />
          <span className="hidden min-[420px]:inline">CipherFlow</span>
        </button>
        <Tag color="green" className="hidden sm:inline-block">CyberChef</Tag>
      </div>
      <button className={`btn whitespace-nowrap ${page === 'flows' ? 'btn-on' : ''}`} onClick={onHome} title="Todos tus flujos guardados">
        <LayoutList size={13} /><span className="hidden sm:inline">Mis flujos</span>
      </button>
      {labSelect('btn hidden max-w-[9.5rem] border-green/40 bg-base text-green md:inline-flex xl:max-w-[13rem]')}
      {examplesButton('btn hidden whitespace-nowrap md:inline-flex')}
      <button className="btn" onClick={onNew} title="Crear un flujo vacío" aria-label="Nuevo flujo"><Plus size={13} /><span className="hidden sm:inline">Nuevo</span></button>
      <button className="btn hidden md:inline-flex" onClick={onImport} title="Importar un flujo o una receta de CyberChef como flujo nuevo" aria-label="Importar"><Upload size={13} /><span className="hidden lg:inline">Importar</span></button>
      <button className="btn relative" onClick={() => openAI(true)} title={aiOn ? 'IA activada · ajustes' : 'Activar la IA (opcional)'} aria-label="Ajustes de IA">
        <Sparkles size={13} /><span className="hidden sm:inline">IA</span>
        <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${aiOn ? 'bg-green' : 'bg-border'}`} aria-hidden="true" />
      </button>
      <a className="btn btn-icon hidden lg:inline-flex" href="https://github.com/edison-enriquez/cipherflow" target="_blank" rel="noreferrer" aria-label="Código en GitHub" title="Código en GitHub"><Github size={13} /></a>
      <button className="btn btn-icon hidden md:inline-flex" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}>
        {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
      </button>
      <div className="relative lg:hidden" ref={moreRef}>
        <button className={`btn btn-icon ${more ? 'btn-on' : ''}`} onClick={() => setMore(v => !v)} aria-label="Más opciones" aria-expanded={more}><MoreVertical size={14} /></button>
        {more && (
          <div className="fixed inset-x-2 top-12 z-50 space-y-2 border border-border bg-surface p-2.5 shadow-xl md:absolute md:inset-x-auto md:right-0 md:top-9 md:w-48" role="menu">
            <div className="space-y-2 md:hidden">
              {labSelect('btn w-full justify-between border-green/40 bg-base text-green')}
              {examplesButton('btn w-full')}
            </div>
            <button className="btn w-full md:hidden" role="menuitem" onClick={() => { setMore(false); onImport() }}><Upload size={13} /> Importar</button>
            <div className="flex gap-2">
              <button className="btn flex-1 md:hidden" role="menuitem" onClick={() => { setMore(false); onToggleTheme() }}>{theme === 'dark' ? <><Sun size={13} /> Tema claro</> : <><Moon size={13} /> Tema oscuro</>}</button>
              <a className="btn flex-1" role="menuitem" href="https://github.com/edison-enriquez/cipherflow" target="_blank" rel="noreferrer"><Github size={13} /> GitHub</a>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
