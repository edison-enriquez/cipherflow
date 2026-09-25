import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { INV_MIX, INV_SBOX, MIX, SBOX, aesBlock, expandKey, gmul, modeTrace } from '../lib/aes'
import { bin8, fromHex, hx, latin1, toHex, toggleBytes } from '../lib/bytes'
import { H, More, Note, P, Table, Verify, type ExplainCtx } from './common'

const MODE_DESC: Record<string, [string, string]> = {
  ECB: ['Cada bloque se cifra por separado. Bloques iguales producen texto cifrado igual, por eso ECB revela patrones.', 'Cada bloque se descifra por separado. Es el modo más simple e inseguro: bloques iguales dan resultados iguales.'],
  CBC: ['Antes de cifrar, cada bloque se combina con XOR con el bloque cifrado anterior (el primero, con el IV). Así, bloques iguales dan resultados distintos.', 'Cada bloque se descifra con AES y luego se combina con XOR con el bloque cifrado anterior (el primero, con el IV).'],
  CFB: ['AES cifra el bloque cifrado anterior (al inicio, el IV) y el resultado se combina con XOR con el mensaje.', 'AES cifra el bloque cifrado anterior (al inicio, el IV) y el resultado se combina con XOR con el texto cifrado.'],
  OFB: ['AES se aplica una y otra vez sobre el IV para generar un flujo de clave, que se combina con XOR con el mensaje.', 'AES se aplica una y otra vez sobre el IV para generar el mismo flujo de clave, que se combina con XOR con el texto cifrado.'],
  CTR: ['AES cifra un contador (el IV, que aumenta en 1 en cada bloque) y el resultado se combina con XOR con el mensaje.', 'Igual que al cifrar: AES cifra el contador y el resultado se combina con XOR. Cifrar y descifrar es la misma operación.'],
}

function Matrix({ s, pick, rel, onPick }: { s: Uint8Array; pick?: number; rel?: number[]; onPick: (i: number) => void }) {
  const cells: ReactNode[] = []
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const i = r + 4 * c
    const cls = pick === i ? 'border-green bg-green/15 font-bold text-green' : rel?.includes(i) ? 'border-yellow/50 bg-yellow/15' : 'border-border bg-elevated hover:border-green/50'
    cells.push(<button key={i} className={`h-[30px] rounded-[3px] border text-xs ${cls}`} title={`Fila ${r}, columna ${c}`} onClick={() => onPick(i)}>{hx(s[i])}</button>)
  }
  return <div className="grid grid-cols-[repeat(4,38px)] gap-[3px]">{cells}</div>
}

export function Aes({ ctx, decrypt }: { ctx: ExplainCtx; decrypt: boolean }) {
  const keyArg = ctx.arg('Key'), ivArg = ctx.arg('IV'), modeFull: string = ctx.arg('Mode') ?? 'CBC'
  const mode = modeFull.split('/')[0], noPad = modeFull.endsWith('NoPadding')
  const inputFmt = ctx.arg('Input'), outputFmt = ctx.arg('Output')
  const ivFrom = decrypt ? ctx.arg('IV from input') : 'Off', ivLen = decrypt ? (+ctx.arg('IV Length') || 16) : 16
  const [block, setBlock] = useState(0)
  const [step, setStep] = useState(0)
  const [cell, setCell] = useState(0)

  const t = useMemo(() => {
    const key = toggleBytes(keyArg?.string, keyArg?.option)
    if (![16, 24, 32].includes(key.length) || mode === 'GCM') return { key, err: true as const }
    let iv = toggleBytes(ivArg?.string, ivArg?.option)
    let data = inputFmt === 'Hex' ? fromHex(ctx.inStr) : latin1(ctx.inStr)
    if (ivFrom && ivFrom !== 'Off') {
      if (ivFrom === 'From start') { iv = data.slice(0, ivLen); data = data.slice(ivLen) } else { iv = data.slice(data.length - ivLen); data = data.slice(0, data.length - ivLen) }
    }
    if (!iv.length) iv = new Uint8Array(16)
    const ks = expandKey(key)
    const tr = modeTrace(mode, decrypt, ks, iv, data, noPad)
    const outBytes = outputFmt === 'Hex' ? fromHex(ctx.outStr.split('\n')[0]) : latin1(ctx.outStr)
    const ok = tr.res.length ? toHex(outBytes).includes(toHex(tr.res)) : !outBytes.length
    return { key, err: false as const, ks, tr, data, ok }
  }, [keyArg, ivArg, mode, noPad, inputFmt, outputFmt, ivFrom, ivLen, decrypt, ctx.inStr, ctx.outStr])

  useEffect(() => { setBlock(0); setStep(0); setCell(0) }, [ctx.inStr, keyArg, mode])

  if (t.err) {
    return mode === 'GCM'
      ? <P>GCM combina el modo contador (CTR) con una etiqueta de autenticación calculada en el campo GF(2¹²⁸). La explicación por bloques está disponible para ECB, CBC, CFB, OFB y CTR; elige uno de esos modos para verla.</P>
      : <P>Para ver el proceso interno, escribe una clave válida de 16, 24 o 32 bytes (ahora tiene {t.key.length}).</P>
  }
  const { ks, tr, data, ok } = t
  const bits = t.key.length * 8
  const B = tr.blocks[Math.min(block, tr.blocks.length - 1)]
  const useDec = decrypt && (mode === 'ECB' || mode === 'CBC')
  const steps = B ? aesBlock(B.aesIn, ks, useDec, true).steps : []
  const st = steps[Math.min(step, steps.length - 1)]
  const r = cell % 4, col = cell >> 2

  let rel: number[] = [], detail: ReactNode = null
  if (st) {
    if (/SubBytes/.test(st.name)) {
      const v = st.before[cell], T = st.name === 'SubBytes' ? SBOX : INV_SBOX
      rel = [cell]
      detail = <>El byte <code className="text-green">{hx(v)}</code> se busca en la {st.name === 'SubBytes' ? 'S-box' : 'S-box inversa'}: fila <code className="text-green">{hx(v)[0]}</code>, columna <code className="text-green">{hx(v)[1]}</code> → <code className="text-green">{hx(T[v])}</code>. La S-box combina el inverso multiplicativo en GF(2⁸) con una transformación afín; es la única parte no lineal de AES.</>
    } else if (/ShiftRows/.test(st.name)) {
      const inv = st.name !== 'ShiftRows', src = r + 4 * (inv ? (col - r + 4) % 4 : (col + r) % 4)
      rel = [src]
      detail = <>La fila {r} se rota {r} posición{r === 1 ? '' : 'es'} hacia la {inv ? 'derecha' : 'izquierda'}. El byte de la columna {col} viene de la columna {src >> 2} (resaltado en «Antes»).</>
    } else if (/MixColumns/.test(st.name)) {
      const M = st.name === 'MixColumns' ? MIX : INV_MIX
      rel = [0, 1, 2, 3].map(k => k + 4 * col)
      detail = <>La columna {col} se multiplica por una matriz fija en GF(2⁸). Para la fila {r}: <code className="text-green">{M[r].map((m, k) => `${m}·${hx(st.before[k + 4 * col])}`).join(' ⊕ ')}</code> = <code className="text-green">{M[r].map((m, k) => hx(gmul(m, st.before[k + 4 * col]))).join(' ⊕ ')}</code> = <code className="text-green">{hx(st.after[cell])}</code>. Multiplicar por 2 es desplazar a la izquierda y, si se sale un bit, aplicar XOR con 1b.</>
    } else {
      rel = [cell]
      detail = <><code className="text-green">{hx(st.before[cell])} ⊕ {hx(st.key![cell])} = {hx(st.after[cell])}</code><br /><span className="text-muted">{bin8(st.before[cell])} ⊕ {bin8(st.key![cell])} = {bin8(st.after[cell])}</span><br />AddRoundKey mezcla el estado con la subclave {st.round}, obtenida de la clave original mediante la expansión de clave.</>
    }
  }
  const label = (s: typeof steps[number], k: number) => k === 0 ? (useDec ? 'ARK' : 'Inicio') : s.name === 'AddRoundKey' ? 'ARK' : s.name.replace('Inv', '⁻').replace('Bytes', 'B').replace('Rows', 'R').replace('Columns', 'C')
  const prevLbl = (i: number) => i === 0 ? 'IV' : mode === 'CTR' ? 'Contador' : mode === 'OFB' ? 'Estado' : 'C' + i
  const Row = ({ l, v }: { l: string; v: Uint8Array }) => <div className="my-0.5 grid grid-cols-[58px_1fr] gap-1"><span className="text-muted">{l}</span><span className="break-all text-[10.5px] leading-snug">{toHex(v)}</span></div>
  const AesBox = ({ inv }: { inv?: boolean }) => <div className="my-1.5 rounded border border-dashed border-purple/60 bg-purple/10 py-1 text-center text-[10.5px] font-bold uppercase tracking-wider text-purple">{inv ? 'AES⁻¹' : 'AES'} con la clave</div>
  const Op = ({ children }: { children: ReactNode }) => <div className="my-0.5 text-center font-bold text-green">{children}</div>

  return (
    <>
      <P><b>AES-{bits}</b> en modo <b>{mode}</b>: la clave de {t.key.length} bytes se expande en {ks.Nr + 1} subclaves y cada bloque de 16 bytes pasa por <b>{ks.Nr} rondas</b>. AES por sí solo cifra un único bloque; el <b>modo de operación</b> decide cómo se encadenan los bloques y dónde entra el IV.</P>

      <H>1. Preparar los bloques</H>
      {!decrypt ? (
        <>
          <P>El mensaje tiene {data.length} bytes. {tr.padN ? `Como el modo ${mode} necesita bloques completos, se agrega relleno PKCS#7: ${tr.padN} byte${tr.padN > 1 ? 's' : ''} con el valor ${hx(tr.padN)}.` : mode === 'CBC' || mode === 'ECB' ? 'Sin relleno (NoPadding): la entrada ya debe medir un múltiplo de 16 bytes.' : `El modo ${mode} funciona como cifrado de flujo: no necesita relleno y el último bloque puede quedar incompleto.`}</P>
          <pre className="panel-pre max-w-[760px] whitespace-pre-wrap">
            {Array.from({ length: Math.min(16, Math.ceil(tr.padded.length / 16)) }, (_, b) => (
              <div key={b}><span className="text-muted">Bloque {b + 1}: </span>{Array.from(tr.padded.subarray(b * 16, b * 16 + 16), (x, i) => <span key={i} className={b * 16 + i >= data.length ? 'pad-a' : ''}>{hx(x)} </span>)}</div>
            ))}
          </pre>
        </>
      ) : (
        <P>Llegan {data.length} bytes de texto cifrado{inputFmt === 'Hex' ? ' (leídos desde hex)' : ''}: {Math.ceil(data.length / 16)} bloque(s) de 16 bytes.{(mode === 'CBC' || mode === 'ECB') && !noPad ? ' Al final se quita el relleno PKCS#7.' : ''}</P>
      )}

      <H>2. Encadenar los bloques (modo {mode})</H>
      <P>{MODE_DESC[mode]?.[decrypt ? 1 : 0]}</P>
      <Note>Toca un bloque para ver sus rondas internas más abajo.</Note>
      <div className="flex gap-3 overflow-x-auto pb-2 pt-1">
        {tr.blocks.slice(0, 16).map((b, i) => (
          <button key={i} onClick={() => { setBlock(i); setStep(0) }} className={`relative w-[240px] shrink-0 rounded-lg border bg-surface p-2.5 text-left text-[11.5px] ${i === block ? 'border-green shadow-[0_0_0_3px_rgb(var(--c-green)/0.15)]' : 'border-border hover:border-green/40'}`}>
            <div className="label mb-1.5">Bloque {i + 1}</div>
            {mode === 'ECB' ? <><Row l={decrypt ? `C${i + 1}` : `P${i + 1}`} v={b.inp} /><AesBox inv={decrypt} /><Row l={decrypt ? `P${i + 1}` : `C${i + 1}`} v={b.res} /></>
              : mode === 'CBC' ? (!decrypt
                ? <><Row l={`P${i + 1}`} v={b.inp} /><Op>⊕ {prevLbl(i)}</Op><Row l={prevLbl(i)} v={b.prev} /><Row l="=" v={b.aesIn} /><AesBox /><Row l={`C${i + 1}`} v={b.res} /></>
                : <><Row l={`C${i + 1}`} v={b.inp} /><AesBox inv /><Row l="=" v={b.aesOut} /><Op>⊕ {prevLbl(i)}</Op><Row l={prevLbl(i)} v={b.prev} /><Row l={`P${i + 1}`} v={b.res} /></>)
              : <><Row l={mode === 'CTR' ? 'Contador' : prevLbl(i)} v={b.aesIn} /><AesBox /><Row l="Flujo" v={b.aesOut.subarray(0, b.inp.length)} /><Op>⊕</Op><Row l={decrypt ? `C${i + 1}` : `P${i + 1}`} v={b.inp} /><Row l={decrypt ? `P${i + 1}` : `C${i + 1}`} v={b.res} /></>}
            {mode !== 'ECB' && i < Math.min(tr.blocks.length, 16) - 1 && <span className="absolute -right-3 top-1/2 font-bold text-green">→</span>}
          </button>
        ))}
      </div>
      <More shown={Math.min(16, tr.blocks.length)} total={tr.blocks.length} unit="bloques" />
      <Verify ok={ok} />

      {st && (
        <>
          <H>3. Dentro de AES: bloque {block + 1}, {steps.length} transformaciones</H>
          <P>{useDec
            ? 'El descifrado aplica las transformaciones inversas en orden contrario: InvShiftRows, InvSubBytes, AddRoundKey e InvMixColumns, empezando por la última subclave.'
            : 'El estado es una matriz de 4×4 bytes que se llena columna por columna. Cada ronda aplica SubBytes (sustitución con la S-box), ShiftRows (rotar filas), MixColumns (mezclar cada columna) y AddRoundKey (XOR con la subclave). La última ronda omite MixColumns.'}
            {!useDec && decrypt && ' En este modo, incluso al descifrar, AES trabaja siempre en dirección de cifrado.'}</P>
          <div className="my-2 flex flex-wrap items-center gap-[3px]">
            {steps.map((s, k) => (
              <span key={k} className="contents">
                {k > 0 && steps[k - 1].round !== s.round && <span className="mx-0.5 text-[10.5px] text-muted">R{s.round}</span>}
                <button className={`btn px-1.5 py-0.5 text-[10px] tracking-normal ${k === step ? 'btn-on' : ''}`} title={`Ronda ${s.round}: ${s.name}`} onClick={() => { setStep(k); setCell(0) }}>{label(s, k)}</button>
              </span>
            ))}
          </div>
          <Note>Ronda {st.round}: {st.name}. Toca cualquier celda para ver cómo se calcula.</Note>
          <div className="flex flex-wrap items-center gap-3.5">
            <div><div className="label mb-1">Antes</div><Matrix s={st.before} rel={rel} onPick={setCell} /></div>
            {st.key && <><span className="text-lg font-bold text-green">⊕</span><div><div className="label mb-1">Subclave {st.round}</div><Matrix s={st.key} rel={[cell]} onPick={setCell} /></div></>}
            <span className="text-lg font-bold text-green">→</span>
            <div><div className="label mb-1">Después de {st.name}</div><Matrix s={st.after} pick={cell} onPick={setCell} /></div>
          </div>
          <div className="mt-2.5 max-w-[740px] border border-l-2 border-border border-l-green bg-elevated px-3 py-2 text-[12.5px] leading-relaxed">{detail}</div>
          <div className="mt-3 flex gap-1.5">
            <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>← Anterior</button>
            <button className="btn btn-primary" disabled={step >= steps.length - 1} onClick={() => setStep(step + 1)}>Siguiente →</button>
          </div>
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer">Expansión de clave: {ks.rk.length} subclaves</summary>
            <div className="mt-2"><Table heads={['Ronda', 'Subclave']} rows={ks.rk.map((k, i) => [i, toHex(k, ' ')])} /></div>
          </details>
        </>
      )}
    </>
  )
}
