import { useEffect, useRef } from 'react'
import Icon, { type IconName } from './icons'

/** Acción de la hoja contextual. */
export interface Accion {
  id: string
  etiqueta: string
  icono: IconName
  /** Acción destructiva: se pinta en tono de peligro. */
  peligro?: boolean
  onSelect: () => void
}

/**
 * Hoja de acciones (menú contextual) de una fila. Reusa el patrón de
 * diálogo de la app: en móvil sube desde el borde inferior (hoja), en
 * escritorio se centra. Se cierra con Escape o tocando fuera.
 */
export default function HojaAcciones({ titulo, acciones, onClose }: {
  titulo: string; acciones: Accion[]; onClose: () => void
}) {
  const refPrimera = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    refPrimera.current?.focus()
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div
      className="fixed inset-0 z-40 grid items-end justify-items-stretch bg-black/70 pt-[10dvh] md:place-items-center md:p-4"
      onClick={onClose} role="dialog" aria-modal="true" aria-label={titulo}
    >
      <div className="dialogo w-full max-w-sm p-2" onClick={(e) => e.stopPropagation()}>
        <p className="truncate px-2 py-1 text-xs t-muted">{titulo}</p>
        <div className="grid gap-1">
          {acciones.map((a, i) => (
            <button
              key={a.id}
              ref={i === 0 ? refPrimera : undefined}
              onClick={a.onSelect}
              className={`touch-btn flex items-center gap-3 rounded-xl px-3 text-left font-semibold t-hover ${a.peligro ? 'bg-[var(--bad-soft)] text-[var(--bad-bg)]' : ''}`}
            >
              <Icon name={a.icono} size={18} /> {a.etiqueta}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
