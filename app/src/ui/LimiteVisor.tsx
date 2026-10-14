// Límite dedicado al visor PDF: un fallo aquí muestra descarga y reintento
// sin tumbar la pestaña que lo contiene.
import type { ReactNode } from 'react'
import ErrorBoundary from './ErrorBoundary'
import { descargarPDF } from '../infrastructure/fo14Pdf'
import Icon from './icons'

export default function LimiteVisor({ bytes, nombre, children }: {
  bytes: Uint8Array
  nombre: string
  children: ReactNode
}) {
  return (
    <ErrorBoundary
      nombre={`visor:${nombre}`}
      compacto
      accion={(
        <button onClick={() => descargarPDF(bytes, nombre)} className="touch-btn flex items-center gap-1 rounded-xl bg-emerald-400 px-4 font-bold text-slate-950">
          <Icon name="download" size={15} /> Descargar
        </button>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
