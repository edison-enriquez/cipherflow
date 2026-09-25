import { useEffect, useRef, useState } from 'react'
import { Upload, X } from 'lucide-react'

interface Props {
  mode: 'export' | 'import' | null
  exportText: string
  recipe: string | null
  onImport: (text: string) => void
  onClose: () => void
  onCopied: () => void
}

export default function IODialog({ mode, exportText, recipe, onImport, onClose, onCopied }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (mode && !d.open) { setText(''); d.showModal() }
    if (!mode && d.open) d.close()
  }, [mode])

  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t) } catch { /* sin permiso */ } onCopied() }

  return (
    <dialog ref={ref} onClose={onClose} className="w-[min(700px,92vw)] rounded-lg border border-border bg-surface p-0 text-text backdrop:bg-black/60">
      <div className="flex items-center border-b border-border px-4 py-3">
        <h2 className="label flex-1">{mode === 'export' ? 'Exportar' : 'Importar'}</h2>
        <button className="btn btn-icon" onClick={onClose} aria-label="Cerrar"><X size={13} /></button>
      </div>
      <div className="space-y-3 p-4">
        {mode === 'export' ? (
          <>
            {recipe && (
              <section>
                <p className="mb-1.5 text-xs text-muted">Receta de CyberChef hasta el bloque seleccionado. Pégala en CyberChef con «Load recipe».</p>
                <textarea readOnly value={recipe} className="field-input h-24 resize-y" />
                <button className="btn btn-primary mt-2" onClick={() => copy(recipe)}>Copiar receta</button>
              </section>
            )}
            <section>
              <p className="mb-1.5 text-xs text-muted">{recipe ? 'Flujo completo de CipherFlow.' : 'Flujo completo de CipherFlow. Selecciona un bloque antes de exportar para obtener también su receta de CyberChef.'}</p>
              <textarea readOnly value={exportText} className="field-input h-56 resize-y" />
              <button className="btn btn-primary mt-2" onClick={() => copy(exportText)}>Copiar flujo</button>
            </section>
          </>
        ) : (
          <>
            <p className="text-xs text-muted">Pega un flujo de CipherFlow o una receta de CyberChef (el JSON de «Save recipe»). La receta se convierte en una cadena de bloques.</p>
            <textarea value={text} onChange={e => setText(e.target.value)} className="field-input h-64 resize-y" spellCheck={false} aria-label="JSON para importar" />
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async e => {
              const f = e.target.files?.[0]
              if (f) setText(await f.text())
              e.target.value = ''
            }} />
            <div className="flex justify-end gap-2">
              <button className="btn mr-auto" onClick={() => fileRef.current?.click()}><Upload size={12} /> Cargar archivo .json</button>
              <button className="btn" onClick={onClose}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => onImport(text)} disabled={!text.trim()}>Importar</button>
            </div>
          </>
        )}
      </div>
    </dialog>
  )
}
