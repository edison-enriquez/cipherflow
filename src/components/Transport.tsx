import { useRef } from 'react'
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react'
import { useStore } from '../state/store'
import { waitForRun } from '../state/runner'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Barra de ejecución: en vivo, o paso a paso con pulsos que recorren los cables. */
export default function Transport() {
  const step = useStore(s => s.step)
  const startStep = useStore(s => s.startStep)
  const stopStep = useStore(s => s.stopStep)
  const setStep = useStore(s => s.setStep)
  const busy = useRef(false)

  const next = async () => {
    const st = useStore.getState().step
    if (busy.current || !st.on || st.idx >= st.order.length) return
    busy.current = true
    await waitForRun()
    const { edges, step: s } = useStore.getState()
    const id = s.order[s.idx]
    const incoming = edges.filter(e => e.target === id).map(e => e.id)
    setStep({ active: id, hot: incoming })
    if (incoming.length) await sleep(850 / s.speed)
    await sleep(420 / s.speed)
    const cur = useStore.getState().step
    if (cur.on) {
      setStep({ done: [...cur.done, id], idx: cur.idx + 1, active: null, hot: [] })
      if (cur.idx + 1 >= cur.order.length) setStep({ playing: false })
    }
    busy.current = false
  }

  const play = async () => {
    let st = useStore.getState().step
    if (st.playing) { setStep({ playing: false }); return }
    if (st.idx >= st.order.length) startStep()
    setStep({ playing: true })
    while (true) {
      st = useStore.getState().step
      if (!st.on || !st.playing || st.idx >= st.order.length) break
      await next()
      await sleep(220 / st.speed)
    }
    setStep({ playing: false })
  }

  return (
    <div className="absolute left-1/2 top-3 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 border border-border bg-base p-1.5">
      <div className="flex">
        <button className={`btn whitespace-nowrap ${!step.on ? 'btn-on' : ''}`} onClick={stopStep}>En vivo</button>
        <button className={`btn -ml-px whitespace-nowrap ${step.on ? 'btn-on' : ''}`} onClick={startStep}>Paso a paso</button>
      </div>
      {step.on && (
        <div className="flex items-center gap-1.5">
          <button className="btn btn-icon" onClick={startStep} aria-label="Reiniciar" title="Reiniciar"><RotateCcw size={13} /></button>
          <button className="btn btn-primary" onClick={play}>{step.playing ? <><Pause size={12} /> Pausar</> : <><Play size={12} /> Reproducir</>}</button>
          <button className="btn" onClick={() => { setStep({ playing: false }); next() }} disabled={step.idx >= step.order.length}>Paso <SkipForward size={12} /></button>
          <select className="btn bg-base" value={step.speed} onChange={e => setStep({ speed: +e.target.value })} aria-label="Velocidad">
            <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option>
          </select>
          <span className="min-w-[3rem] text-center text-[11px] text-muted">{step.idx} / {step.order.length}</span>
        </div>
      )}
    </div>
  )
}
