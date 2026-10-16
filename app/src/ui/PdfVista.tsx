import { useCallback, useEffect, useRef, useState } from 'react'
import type { RenderTask } from 'pdfjs-dist/types/src/display/api'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { cargarPdfJs, crearObreroPdf } from '../infrastructure/pdfMotor'
import { descargarPDF } from '../infrastructure/fo14Pdf'
import Icon from './icons'

// Subconjunto usado del documento pdf.js (el tipo publicado omite destroy).
type DocPdf = PDFDocumentProxy & { destroy(): Promise<void> }

// Decide el visor inicial a partir de las señales del dispositivo.
export function debeUsarVisorPropio(coarse: boolean, tactil: boolean, uaMovil: boolean): boolean {
  return (coarse && tactil) || (uaMovil && tactil)
}

// Gancho reactivo: true en táctiles con puntero grueso o UA móvil.
export function useEsMovil(): boolean {
  const leer = useCallback((): boolean => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
    const tactil = navigator.maxTouchPoints > 0 || 'ontouchstart' in window
    const uaMovil = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    return debeUsarVisorPropio(coarse, tactil, uaMovil)
  }, [])
  const [movil, setMovil] = useState(leer)
  useEffect(() => {
    const mq = window.matchMedia?.('(pointer: coarse)')
    const act = () => setMovil(leer())
    mq?.addEventListener('change', act)
    window.addEventListener('resize', act)
    return () => {
      mq?.removeEventListener('change', act)
      window.removeEventListener('resize', act)
    }
  }, [leer])
  return movil
}

// Visor propio para móvil: solo pinta las páginas en vista y libera el resto.
export default function VisorPdfMovil({ bytes, nombre }: { bytes: Uint8Array; nombre: string }) {
  const [pdf, setPdf] = useState<DocPdf | null>(null)
  const [total, setTotal] = useState(0)
  const [escala, setEscala] = useState(1.2)
  const [error, setError] = useState<string | null>(null)
  const [carga, setCarga] = useState(0)
  const contRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let vivo = true
    let doc: DocPdf | null = null
    let obrero: Worker | null = null
    ;(async () => {
      try {
        if (bytes.length === 0) throw new Error('Documento vacío')
        const pdfjs = await cargarPdfJs()
        if (!vivo) return
        const ob = await crearObreroPdf()
        if (!vivo) { ob.terminate(); return }
        obrero = ob
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()
        pdfjs.GlobalWorkerOptions.workerPort = obrero
        doc = (await pdfjs.getDocument({ data: bytes.slice() }).promise) as unknown as DocPdf
        if (!vivo) {
          await doc.destroy().catch(() => undefined)
          obrero.terminate()
          return
        }
        setPdf(doc)
        setTotal(doc.numPages)
        setError(null)
      } catch (e) {
        try { obrero?.terminate() } catch { /* obrero no disponible */ }
        if (vivo) setError(e instanceof Error ? `${e.name}: ${e.message}` : 'Error desconocido')
      }
    })()
    return () => {
      vivo = false
      if (doc) void doc.destroy().catch(() => undefined)
      try { obrero?.terminate() } catch { /* obrero no disponible */ }
    }
  }, [bytes, carga])

  const irA = (n: number) => {
    contRef.current?.querySelector(`#pv-p${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (error) {
    return (
      <div className="p-4 text-sm" role="alert">
        <p className="font-bold text-slate-700">No se pudo mostrar el documento en este dispositivo.</p>
        <p className="mt-1 break-words text-xs text-slate-500">{error}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => descargarPDF(bytes, nombre)} className="touch-btn flex items-center gap-1 rounded-xl bg-[var(--ok-bg)] px-4 font-bold text-[var(--ok-ink)]"><Icon name="download" size={15} /> Descargar</button>
          <button onClick={() => { setError(null); setCarga((c) => c + 1) }} className="touch-btn flex items-center gap-1 rounded-xl bg-slate-100 px-4 font-semibold text-slate-700"><Icon name="rotate" size={15} /> Reintentar</button>
        </div>
      </div>
    )
  }
  if (!pdf) return <p role="status" className="p-4 text-sm text-slate-500">Cargando documento…</p>

  return (
    <div className="flex h-full flex-col bg-white" role="document" aria-label={nombre}>
      <div className="flex items-center gap-1 border-b border-slate-200 px-2 py-1.5 text-sm">
        <button onClick={() => irA(1)} className="touch-btn rounded-lg px-2 py-1 text-slate-700" aria-label="Ir a la primera página"><Icon name="up" size={15} /></button>
        <span className="text-xs text-slate-500">{total} páginas</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setEscala((e) => Math.max(0.8, +(e - 0.2).toFixed(1)))} className="touch-btn rounded-lg bg-slate-100 px-3 py-1 font-bold text-slate-700" aria-label="Reducir zoom">−</button>
          <span className="w-11 text-center text-xs text-slate-500">{Math.round((escala / 1.2) * 100)}%</span>
          <button onClick={() => setEscala((e) => Math.min(2.5, +(e + 0.2).toFixed(1)))} className="touch-btn rounded-lg bg-slate-100 px-3 py-1 font-bold text-slate-700" aria-label="Ampliar zoom">+</button>
        </div>
      </div>
      <div ref={contRef} className="min-h-0 flex-1 overflow-y-auto bg-slate-200 p-2">
        {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
          <Pagina key={n} pdf={pdf} num={n} escala={escala} />
        ))}
      </div>
    </div>
  )
}

// Página individual: reserva su tamaño real y pinta el canvas solo en vista;
// al salir se cancela y se libera la memoria.
function Pagina({ pdf, num, escala }: { pdf: DocPdf; num: number; escala: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(num <= 2)
  const [fallo, setFallo] = useState(false)
  const [intento, setIntento] = useState(0)
  const [proporcion, setProporcion] = useState('612 / 792')

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        if (e.target === el) setVisible(e.isIntersecting)
      }
    }, { rootMargin: '400px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    const canvas = canvasRef.current
    if (!canvas) return
    let vivo = true
    let tarea: RenderTask | null = null
    ;(async () => {
      try {
        const pag = await pdf.getPage(num)
        if (!vivo) return
        const base = pag.getViewport({ scale: 1 })
        setProporcion(`${base.width} / ${base.height}`)
        const vp = pag.getViewport({ scale: escala })
        const dpr = Math.min(window.devicePixelRatio || 1, 1.25)
        canvas.width = Math.max(1, Math.floor(vp.width * dpr))
        canvas.height = Math.max(1, Math.floor(vp.height * dpr))
        tarea = pag.render({ canvas, viewport: vp.clone({ scale: escala * dpr }) })
        await tarea.promise
        if (vivo) setFallo(false)
      } catch {
        if (vivo) setFallo(true)
      }
    })()
    return () => {
      vivo = false
      try { tarea?.cancel() } catch { /* render ya terminado */ }
      canvas.width = 0
      canvas.height = 0
    }
  }, [pdf, num, escala, visible, intento])

  return (
    <div ref={ref} id={`pv-p${num}`} className="mb-2 scroll-mt-2 overflow-hidden rounded bg-white shadow" aria-label={`Página ${num}`}>
      <div className="w-full" style={{ aspectRatio: proporcion }}>
        {!fallo
          ? <canvas ref={canvasRef} className="h-auto w-full" />
          : (
            <p className="flex h-full flex-col items-center justify-center gap-2 p-3 text-xs text-slate-500">
              Página {num} no disponible.
              <button onClick={() => { setFallo(false); setIntento((i) => i + 1) }} className="touch-btn flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1 font-semibold text-slate-700"><Icon name="rotate" size={14} /> Reintentar</button>
            </p>
          )}
      </div>
      <p className="border-t border-slate-100 py-1 text-center text-[11px] text-slate-400">{num}</p>
    </div>
  )
}
