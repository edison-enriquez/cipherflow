import { useEffect, useState } from 'react'
import { useStore } from '../state/store'

export default function Toast() {
  const toast = useStore(s => s.toast)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!toast) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 2400)
    return () => clearTimeout(t)
  }, [toast])
  return (
    <div role="status" className={`pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 border border-green/40 bg-surface px-3.5 py-2 text-xs text-green transition-opacity ${visible ? 'opacity-100' : 'opacity-0'}`}>
      {toast?.msg}
    </div>
  )
}
