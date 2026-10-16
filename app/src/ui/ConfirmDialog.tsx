import { useEffect, useRef } from 'react'
import { btnSec } from './MateriasPanel'

/** Diálogo de confirmación propio (adaptado a móvil/PWA). */
export default function ConfirmDialog({ titulo, mensaje, confirmar = 'Eliminar', onConfirm, onCancel }: {
  titulo: string; mensaje?: string; confirmar?: string
  onConfirm: () => void; onCancel: () => void
}) {
  const refPeligro = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    refPeligro.current?.focus()
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCancel])
  return (
    <div className="fixed inset-0 z-40 grid items-end justify-items-stretch bg-black/70 pt-[10dvh] md:place-items-center md:p-4" onClick={onCancel} role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="dialogo w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="display text-xl font-bold">{titulo}</h3>
        {mensaje && <p className="mt-1 text-sm t-muted">{mensaje}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onCancel} className={btnSec}>Cancelar</button>
          <button ref={refPeligro} onClick={onConfirm} className="touch-btn rounded-xl bg-[var(--bad-bg)] px-4 font-bold text-[var(--bad-ink)]">{confirmar}</button>
        </div>
      </div>
    </div>
  )
}
