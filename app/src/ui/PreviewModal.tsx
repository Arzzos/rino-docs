import { useEffect, useRef, useState } from 'react'
import { descargarPDF, pdfAUrl } from '../infrastructure/fo14Pdf'
import Icon from './icons'
import VisorPdfMovil, { useEsMovil } from './PdfVista'
import LimiteVisor from './LimiteVisor'

export default function PreviewModal({ bytes, nombre, onClose }: { bytes: Uint8Array; nombre: string; onClose: () => void }) {
  const [url, setUrl] = useState('')
  const movil = useEsMovil()
  const [forzarNativo, setForzarNativo] = useState(false)
  const propio = movil && !forzarNativo
  const refCerrar = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (propio) return
    const u = pdfAUrl(bytes)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [bytes, propio])
  useEffect(() => {
    refCerrar.current?.focus()
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black/80 p-2 md:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={nombre}>
      <div className="mx-auto flex w-full max-w-5xl items-center gap-2 pb-2" onClick={(e) => e.stopPropagation()}>
        <p className="truncate text-sm font-semibold t-ink2">{nombre}</p>
        {movil && (
          <button onClick={() => setForzarNativo((v) => !v)} className="touch-btn flex items-center gap-1 rounded-xl t-surface2 px-3 text-xs" title={propio ? 'Usar visor del sistema' : 'Usar visor de la aplicación'}>
            <Icon name="eye" size={15} /> {propio ? 'Sistema' : 'App'}
          </button>
        )}
        <button onClick={() => descargarPDF(bytes, nombre)} className="touch-btn ml-auto flex items-center gap-1 rounded-xl bg-[var(--ok-bg)] px-4 font-bold text-[var(--ok-ink)]"><Icon name="download" size={15} /> Descargar</button>
        <button ref={refCerrar} onClick={onClose} className="touch-btn flex items-center gap-1 rounded-xl t-surface2 px-4"><Icon name="x" size={15} /> Cerrar</button>
      </div>
      <div className="mx-auto w-full max-w-5xl flex-1 overflow-hidden rounded-xl bg-white" onClick={(e) => e.stopPropagation()}>
        {propio
          ? <LimiteVisor bytes={bytes} nombre={nombre}><VisorPdfMovil bytes={bytes} nombre={nombre} /></LimiteVisor>
          : url && <iframe src={url} title={nombre} className="h-full w-full" />}
      </div>
    </div>
  )
}
