import { Github, LayoutList, Menu, Moon, Plus, Sparkles, Sun, Upload } from 'lucide-react'
import { useAgentStore } from '../agent/config'
import { EXAMPLE_GROUPS } from '../io'
import { LABS } from '../labs'
import { Tag } from './ui'
import type { Theme } from '../hooks/useTheme'

interface Props {
  theme: Theme
  onToggleTheme: () => void
  onHome: () => void
  onExample: (name: string) => void
  onLab: (id: string) => void
  onNew: () => void
  onImport: () => void
  onMenu: () => void
  home: boolean
  showMenu: boolean
}

export default function Header({ theme, onToggleTheme, onHome, onExample, onLab, onNew, onImport, onMenu, home, showMenu }: Props) {
  const aiOn = useAgentStore(s => s.enabled)
  const openAI = useAgentStore(s => s.setSettingsOpen)
  return (
    <header className="z-20 flex h-12 shrink-0 items-center gap-1.5 overflow-x-auto sm:gap-2 border-b border-border bg-base px-3 sm:px-4">
      {showMenu && <button className="btn btn-icon md:hidden" onClick={onMenu} aria-label="Abrir el panel lateral"><Menu size={14} /></button>}
      <div className="mr-auto flex min-w-0 items-center gap-3 overflow-hidden">
        <button className="flex shrink-0 items-center gap-1.5 text-sm font-bold uppercase tracking-widest hover:text-green sm:text-[15px]" onClick={onHome} title="Mis flujos">
          <span className="inline-block h-2.5 w-2.5 bg-green" aria-hidden="true" />
          <span className="hidden min-[420px]:inline">CipherFlow</span>
        </button>
        <Tag color="green" className="hidden sm:inline-block">CyberChef</Tag>
      </div>
      <button className={`btn whitespace-nowrap ${home ? 'btn-on' : ''}`} onClick={onHome} title="Todos tus flujos guardados">
        <LayoutList size={13} /><span className="hidden sm:inline">Mis flujos</span>
      </button>
      <select
        className="btn max-w-[8rem] border-green/40 bg-base text-green sm:max-w-none"
        value=""
        onChange={e => { if (e.target.value) onLab(e.target.value) }}
        aria-label="Cargar un laboratorio"
        title="Laboratorios de vulnerabilidades"
      >
        <option value="">Laboratorios</option>
        {Object.values(LABS).map(l => <option key={l.id} value={l.id}>{l.titulo}</option>)}
      </select>
      <select
        className="btn max-w-[9rem] bg-base sm:max-w-none"
        value=""
        onChange={e => { if (e.target.value) onExample(e.target.value) }}
        aria-label="Cargar un ejemplo"
      >
        <option value="">Ejemplos</option>
        {Object.entries(EXAMPLE_GROUPS).map(([g, ex]) => (
          <optgroup key={g} label={g}>
            {Object.keys(ex).map(k => <option key={k} value={k}>{k}</option>)}
          </optgroup>
        ))}
      </select>
      <button className="btn" onClick={onNew} title="Crear un flujo vacío"><Plus size={13} /><span className="hidden sm:inline">Nuevo</span></button>
      <button className="btn" onClick={onImport} title="Importar un flujo o una receta de CyberChef como flujo nuevo"><Upload size={13} /><span className="hidden sm:inline">Importar</span></button>
      <button className="btn relative" onClick={() => openAI(true)} title={aiOn ? 'IA activada · ajustes' : 'Activar la IA (opcional)'} aria-label="Ajustes de IA">
        <Sparkles size={13} /><span className="hidden sm:inline">IA</span>
        <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${aiOn ? 'bg-green' : 'bg-border'}`} aria-hidden="true" />
      </button>
      <a className="btn btn-icon hidden sm:inline-flex" href="https://github.com/edison-enriquez/cipherflow" target="_blank" rel="noreferrer" aria-label="Código en GitHub" title="Código en GitHub"><Github size={13} /></a>
      <button className="btn btn-icon" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}>
        {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
      </button>
    </header>
  )
}
