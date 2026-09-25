import { Download, Github, Menu, Moon, Sun, Trash2, Upload } from 'lucide-react'
import { EXAMPLE_GROUPS } from '../io'
import { LABS } from '../labs'
import { Tag } from './ui'
import type { Theme } from '../hooks/useTheme'

interface Props {
  theme: Theme
  onToggleTheme: () => void
  onExample: (name: string) => void
  onLab: (id: string) => void
  onExport: () => void
  onImport: () => void
  onClear: () => void
  onMenu: () => void
}

export default function Header({ theme, onToggleTheme, onExample, onLab, onExport, onImport, onClear, onMenu }: Props) {
  return (
    <header className="z-20 flex h-12 shrink-0 items-center gap-1.5 overflow-x-auto sm:gap-2 border-b border-border bg-base px-3 sm:px-4">
      <button className="btn btn-icon md:hidden" onClick={onMenu} aria-label="Abrir la lista de bloques"><Menu size={14} /></button>
      <div className="mr-auto flex min-w-0 items-center gap-3">
        <span className="flex shrink-0 items-center gap-1.5 text-sm font-bold uppercase tracking-widest sm:text-[15px]">
          <span className="inline-block h-2.5 w-2.5 bg-green" aria-hidden="true" />
          <span className="hidden min-[420px]:inline">CipherFlow</span>
        </span>
        <Tag color="green" className="hidden sm:inline-block">CyberChef</Tag>
        <span className="hidden truncate text-xs uppercase tracking-wider text-muted lg:inline">Flujos criptográficos por nodos</span>
      </div>
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
      <button className="btn" onClick={onExport} title="Exportar el flujo o la receta de CyberChef"><Download size={13} /><span className="hidden sm:inline">Exportar</span></button>
      <button className="btn" onClick={onImport} title="Importar un flujo o una receta de CyberChef"><Upload size={13} /><span className="hidden sm:inline">Importar</span></button>
      <button className="btn hover:!border-red/50 hover:!text-red" onClick={onClear} title="Borrar todos los bloques"><Trash2 size={13} /><span className="hidden sm:inline">Limpiar</span></button>
      <a className="btn btn-icon hidden sm:inline-flex" href="https://github.com/edison-enriquez/cipherflow" target="_blank" rel="noreferrer" aria-label="Código en GitHub" title="Código en GitHub"><Github size={13} /></a>
      <button className="btn btn-icon" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'} title={theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}>
        {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
      </button>
    </header>
  )
}
