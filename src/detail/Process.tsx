import type { ReactNode } from 'react'
import { entropy, fmtSize, fromUtf8 } from '../lib/bytes'
import { EXPLAINED, opInfo } from '../engine/catalog'
import { opConfig } from '../engine/cyberchef'
import type { Result } from '../engine/types'
import { EXPLAINERS, type ExplainCtx } from '../explainers'

function Bar({ value, max }: { value: number; max: number }) {
  return <div className="h-1 bg-border"><div className="h-full bg-green" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} /></div>
}

const SectionTitle = ({ children }: { children: ReactNode }) => <h3 className="label mb-2.5">{children}</h3>

export default function Process({ op, res, input, ctx }: { op: string; res?: Result; input?: Result; ctx: ExplainCtx | null }) {
  const info = opInfo(op)
  const cfg = opConfig(op)
  if (!res || !res.ok) {
    return <section><SectionTitle>Qué entra y qué sale</SectionTitle><p className="text-[13px]">{res ? 'La operación falló, así que no hay transformación que mostrar. Revisa el mensaje en Salida y los parámetros.' : 'Calculando…'}</p></section>
  }
  const inB = input?.ok ? input.bytes! : null
  const outB = res.bytes!
  const Explainer = EXPLAINERS[op]
  const hexText = outB.length > 8 && /^[0-9a-f\s:,]+$/i.test(fromUtf8(outB.subarray(0, 2000)))

  return (
    <>
      <section className="mb-6 max-w-[1100px]">
        <SectionTitle>Qué entra y qué sale</SectionTitle>
        {info.inputs === 0 ? <p className="text-[13px]">Este origen produce {fmtSize(outB.length)} a partir de lo que escribiste.</p>
          : op === '__output' ? <p className="text-[13px]">La salida no transforma nada: muestra el dato que llega por su cable.</p>
          : cfg ? (
            <ol className="mb-3 list-decimal space-y-0.5 pl-5 text-[13px]">
              <li>{inB ? <>Llega un dato de tipo <b>{input!.type}</b> con {fmtSize(inB.length)}.</> : 'No llega nada, así que la operación recibe un texto vacío.'}</li>
              {inB && cfg.inputType.toLowerCase() !== input!.type!.toLowerCase() && <li>CyberChef lo convierte a <b>{cfg.inputType}</b>, el tipo que la operación necesita.</li>}
              <li>La operación <b>{op}</b> se ejecuta con los parámetros elegidos.</li>
              <li>Sale un dato de tipo <b>{res.type}</b> con {fmtSize(outB.length)}.{res.op?.presentType === 'html' && ' CyberChef además genera una vista enriquecida («Vista de CyberChef» en Salida).'}</li>
            </ol>
          ) : <p className="mb-3 text-[13px]">{info.desc}</p>}
        {inB && op !== '__output' && (
          <>
            <div className="grid max-w-[580px] grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 text-[11.5px] text-muted">
              <span>Tamaño entrada</span><Bar value={inB.length} max={Math.max(inB.length, outB.length, 1)} /><span>{fmtSize(inB.length)}</span>
              <span>Tamaño salida</span><Bar value={outB.length} max={Math.max(inB.length, outB.length, 1)} /><span>{fmtSize(outB.length)}</span>
              <span>Entropía entrada</span><Bar value={entropy(inB)} max={8} /><span>{entropy(inB).toFixed(2)} bits/byte</span>
              <span>Entropía salida</span><Bar value={entropy(outB)} max={8} /><span>{entropy(outB).toFixed(2)} bits/byte</span>
            </div>
            <p className="mt-2 max-w-[78ch] text-[11.5px] text-muted">
              La entropía mide qué tan impredecibles son los bytes: un texto normal ronda 4 bits/byte; datos cifrados o comprimidos se acercan a 8.
              {hexText && ' Aquí la salida está escrita como texto hexadecimal, que solo usa 16 símbolos, así que su entropía no puede pasar de 4 aunque los bytes que representa sean aleatorios.'}
            </p>
            {inB.length === outB.length && inB.length > 0 && (() => {
              let ch = 0
              for (let i = 0; i < inB.length; i++) if (inB[i] !== outB[i]) ch++
              return <p className="mt-2 text-[13px]">Mismo tamaño: cambiaron {ch} de {inB.length} bytes ({((100 * ch) / inB.length).toFixed(0)} %).</p>
            })()}
          </>
        )}
      </section>
      {Explainer && ctx ? (
        <section className="max-w-[1100px]">
          <SectionTitle>Qué hace por dentro, paso a paso</SectionTitle>
          <Explainer ctx={ctx} />
        </section>
      ) : cfg && !EXPLAINED.has(op) ? (
        <p className="text-[11.5px] text-muted">Las operaciones marcadas con ★ (AES, SHA-256, Base64, hex, binario, XOR, ROT13 y Vigenère) muestran además su funcionamiento interno byte a byte.</p>
      ) : null}
    </>
  )
}
