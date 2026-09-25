import { useRef, type ReactNode } from 'react'
import { fmtSize, fromB64, sanitizeHTML, toB64 } from '../lib/bytes'
import { hiddenArgs, opConfig, type ArgConfig } from '../engine/cyberchef'
import { opInfo } from '../engine/catalog'
import type { OpNodeT } from '../engine/types'
import { useStore } from '../state/store'

const isHeading = (o: unknown) => typeof o === 'string' && /^\[[\s\S]*\]$/.test(o)

function Field({ id, label, children }: { id?: string; label: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-3">
      <label htmlFor={id} className="label mb-1 block">{label}</label>
      {children}
    </div>
  )
}

function Options({ id, value, options, onChange, ariaLabel }: { id?: string; value: string; options: any[]; onChange: (v: string) => void; ariaLabel?: string }) {
  return (
    <select id={id} aria-label={ariaLabel} className="field-input" value={value} onChange={e => onChange(e.target.value)}>
      {options.map((o, i) => {
        const name = typeof o === 'string' ? o : o.name
        return <option key={i} value={name} disabled={isHeading(o)}>{isHeading(o) ? name.slice(1, -1) : name}</option>
      })}
    </select>
  )
}

function ArgField({ a, i, args, set, setMany }: { a: ArgConfig; i: number; args: any[]; set: (i: number, v: any) => void; setMany: (patch: Record<number, any>) => void }) {
  const id = 'arg' + i
  const v = args[i]
  switch (a.type) {
    case 'boolean':
      return (
        <label className="mb-3 flex items-center gap-2 text-[12.5px]">
          <input type="checkbox" className="accent-[rgb(var(--c-green))]" checked={!!v} onChange={e => set(i, e.target.checked)} /> {a.name}
        </label>
      )
    case 'number':
      return <Field id={id} label={a.name}><input id={id} type="number" className="field-input" min={a.min} max={a.max} step={a.step} value={v ?? ''} onChange={e => set(i, e.target.value === '' ? 0 : +e.target.value)} /></Field>
    case 'option':
    case 'argSelector':
      return <Field id={id} label={a.name}><Options id={id} value={v} options={a.value} onChange={x => set(i, x)} /></Field>
    case 'editableOption':
    case 'editableOptionShort':
      return (
        <Field id={id} label={a.name}>
          <div className="flex">
            <input id={id} className="field-input flex-1" spellCheck={false} value={v ?? ''} onChange={e => set(i, e.target.value)} />
            <select className="field-input -ml-px w-auto max-w-[45%]" value="" aria-label={'Valores predefinidos de ' + a.name} onChange={e => { if (e.target.selectedIndex > 0) set(i, e.target.value) }}>
              <option value="">Predefinidos</option>
              {(a.value || []).map((o: any, k: number) => <option key={k} value={o.value}>{o.name}</option>)}
            </select>
          </div>
        </Field>
      )
    case 'toggleString': {
      const t = v && typeof v === 'object' ? v : { string: String(v ?? ''), option: a.toggleValues?.[0] }
      return (
        <Field id={id} label={a.name}>
          <div className="flex">
            <input id={id} className="field-input flex-1" spellCheck={false} autoComplete="off" value={t.string} onChange={e => set(i, { ...t, string: e.target.value })} />
            <div className="-ml-px w-auto max-w-[45%]"><Options value={t.option} options={a.toggleValues ?? []} onChange={o => set(i, { ...t, option: o })} ariaLabel={'Formato de ' + a.name} /></div>
          </div>
        </Field>
      )
    }
    case 'populateOption':
    case 'populateMultiOption':
      return (
        <Field id={id} label={a.name}>
          <Options id={id} value={v} options={a.value} onChange={x => {
            const o = a.value.find((o: any) => o.name === x)
            const patch: Record<number, any> = { [i]: x }
            if (o) {
              if (a.type === 'populateOption') patch[a.target as number] = o.value
              else (a.target as number[]).forEach((t, k) => { patch[t] = o.value[k] })
            }
            setMany(patch)
          }} />
        </Field>
      )
    case 'label':
      return <p className="label mb-2 border-t border-border pt-2.5">{a.name}</p>
    case 'text':
      return <Field id={id} label={a.name}><textarea id={id} className="field-input min-h-[84px] resize-y" spellCheck={false} value={v ?? ''} onChange={e => set(i, e.target.value)} /></Field>
    default:
      return <Field id={id} label={a.name}><input id={id} className="field-input" spellCheck={false} autoComplete="off" value={v ?? ''} onChange={e => set(i, e.target.value)} /></Field>
  }
}

export default function Params({ node }: { node: OpNodeT }) {
  const updateData = useStore(s => s.updateData)
  const removeNode = useStore(s => s.removeNode)
  const showToast = useStore(s => s.showToast)
  const fileRef = useRef<HTMLInputElement>(null)
  const { op, args = [], params = {} } = node.data
  const info = opInfo(op)
  const setP = (patch: Record<string, any>) => updateData(node.id, { params: { ...params, ...patch } })

  let body: ReactNode
  if (info.custom) {
    body = (
      <>
        <p className="mb-3 text-xs text-muted">{info.desc}</p>
        {op === '__input' && (params.file ? (
          <div className="mb-3 text-xs">
            <p className="mb-2 text-muted">Archivo cargado: {params.fileName} ({fmtSize(fromB64(params.file).length)})</p>
            <button className="btn" onClick={() => setP({ file: null, fileName: '' })}>Quitar archivo y usar texto</button>
          </div>
        ) : (
          <>
            <Field id="p-text" label="Contenido"><textarea id="p-text" className="field-input min-h-[110px] resize-y" spellCheck={false} value={params.text} onChange={e => setP({ text: e.target.value })} /></Field>
            <Field id="p-fmt" label="Interpretar como"><Options id="p-fmt" value={params.fmt} options={['Texto (UTF-8)', 'Hex', 'Base64']} onChange={v => setP({ fmt: v })} /></Field>
          </>
        ))}
        {op === '__input' && (
          <>
            <input ref={fileRef} type="file" hidden onChange={async e => {
              const f = e.target.files?.[0]
              if (!f) return
              if (f.size > 8e6) { showToast('El archivo supera 8 MB'); return }
              setP({ file: toB64(new Uint8Array(await f.arrayBuffer())), fileName: f.name })
              if (f.size > 1.5e6) showToast('Archivo grande: puede que no se guarde al cerrar la página')
              e.target.value = ''
            }} />
            <button className="btn" onClick={() => fileRef.current?.click()}>Cargar archivo…</button>
          </>
        )}
        {op === '__output' && <Field id="p-label" label="Nombre de esta salida"><input id="p-label" className="field-input" value={params.label} onChange={e => setP({ label: e.target.value })} /></Field>}
        {op === '__concat' && <Field id="p-sep" label="Separador (texto)"><input id="p-sep" className="field-input" value={params.sep} onChange={e => setP({ sep: e.target.value })} /></Field>}
      </>
    )
  } else {
    const cfg = opConfig(op)!
    const hid = hiddenArgs(cfg, args)
    const set = (i: number, v: any) => { const a = args.slice(); a[i] = v; updateData(node.id, { args: a }) }
    const setMany = (patch: Record<number, any>) => { const a = args.slice(); Object.entries(patch).forEach(([k, v]) => { a[+k] = v }); updateData(node.id, { args: a }) }
    body = (
      <>
        {!cfg.args.length && <p className="mb-3 text-xs text-muted">Esta operación no tiene parámetros.</p>}
        {cfg.args.map((a, i) => hid.has(i) ? null : <ArgField key={i} a={a} i={i} args={args} set={set} setMany={setMany} />)}
        <details className="mt-2 text-xs text-muted">
          <summary className="cursor-pointer text-text">Descripción original de CyberChef (inglés)</summary>
          <div className="cc-html mt-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeHTML(cfg.description || '') }} />
          {cfg.infoURL && <a className="mt-2 inline-block text-green" href={cfg.infoURL} target="_blank" rel="noreferrer">Más información</a>}
        </details>
      </>
    )
  }

  return (
    <div>
      {body}
      <div className="mt-4"><button className="btn hover:!border-red/50 hover:!text-red" onClick={() => removeNode(node.id)}>Eliminar bloque</button></div>
    </div>
  )
}
