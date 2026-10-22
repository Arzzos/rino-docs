import React, { useCallback, useEffect, useRef, useState } from 'react'
import { recortarImagen, rotar90 } from '../infrastructure/imageOptimizer'
import Icon from './icons'
import { btnPri, btnSec } from './MateriasPanel'

type Ratio = 'carta' | 'cuadrado'

const RATIOS: Record<Ratio, { label: string; r: number }> = {
  carta: { label: 'Carta / hoja', r: 3 / 4 },
  cuadrado: { label: 'Cuadrado', r: 1 },
}

interface Props {
  dataUrl: string
  onAplicar: (dataUrl: string, ancho: number, alto: number) => void
  onCancel: () => void
}

/**
 * Recorte de imagen de documento sobre canvas.
 * La imagen se muestra escalada para cubrir el marco (cover) y el usuario la
 * arrastra para elegir el área que se conserva. Girar rota el dataUrl de
 * trabajo, por lo que el recorte siempre es axis-aligned sobre la imagen
 * actual.
 */
export default function RecorteImagen({ dataUrl, onAplicar, onCancel }: Props) {
  const [src, setSrc] = useState(dataUrl)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [ratio, setRatio] = useState<Ratio>('carta')
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const [cw, setCw] = useState(0)
  const [ch, setCh] = useState(0)
  const [dw, setDw] = useState(0)
  const [dh, setDh] = useState(0)
  const [msg, setMsg] = useState('')
  const [arrastrando, setArrastrando] = useState(false)
  const start = useRef({ x: 0, y: 0, tx: 0, ty: 0 })
  const contRef = useRef<HTMLDivElement>(null)

  useEffect(() => setSrc(dataUrl), [dataUrl])

  useEffect(() => {
    const el = new Image()
    el.onload = () => setImg(el)
    el.src = src
  }, [src])

  // Recalcula escala cover y centra al cambiar imagen o proporción.
  useEffect(() => {
    if (!img || !contRef.current) return
    const W = contRef.current.clientWidth
    const H = contRef.current.clientHeight
    setCw(W)
    setCh(H)
    if (W === 0 || H === 0) return
    const contR = W / H
    const imgR = img.naturalWidth / img.naturalHeight
    const s = contR >= imgR ? W / img.naturalWidth : H / img.naturalHeight
    setDw(img.naturalWidth * s)
    setDh(img.naturalHeight * s)
    setTx((W - img.naturalWidth * s) / 2)
    setTy((H - img.naturalHeight * s) / 2)
  }, [img, ratio])

  const girar = async () => {
    try {
      const r = await rotar90(src)
      setSrc(r.dataUrl)
    } catch {
      setMsg('No se pudo girar la imagen.')
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    setArrastrando(true)
    start.current = { x: e.clientX, y: e.clientY, tx, ty }
  }

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!arrastrando) return
      const dx = e.clientX - start.current.x
      const dy = e.clientY - start.current.y
      let ntx = start.current.tx + dx
      let nty = start.current.ty + dy
      // La imagen siempre debe cubrir el contenedor: no deja huecos.
      if (dw > cw) ntx = Math.min(0, Math.max(-(dw - cw), ntx))
      else ntx = (cw - dw) / 2
      if (dh > ch) nty = Math.min(0, Math.max(-(dh - ch), nty))
      else nty = (ch - dh) / 2
      setTx(ntx)
      setTy(nty)
    },
    [arrastrando, cw, ch, dw, dh, tx, ty]
  )

  const onPointerUp = useCallback(() => setArrastrando(false), [])

  useEffect(() => {
    const mv = (e: Event) => onPointerMove(e as unknown as React.PointerEvent<HTMLDivElement>)
    const up = () => onPointerUp()
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', h)
    return () => {
      window.removeEventListener('pointermove', mv)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('keydown', h)
    }
  }, [onCancel, onPointerMove, onPointerUp])

  const aplicar = () => {
    if (!img || dw === 0 || dh === 0) return
    const x0 = Math.max(0, Math.min(1, -tx / dw))
    const x1 = Math.max(0, Math.min(1, (cw - tx) / dw))
    const y0 = Math.max(0, Math.min(1, -ty / dh))
    const y1 = Math.max(0, Math.min(1, (ch - ty) / dh))
    if (x1 <= x0 || y1 <= y0) { setMsg('Área de recorte inválida.'); return }
    recortarImagen(src, { x0, y0, x1, y1 })
      .then((r) => onAplicar(r.dataUrl, r.ancho, r.alto))
      .catch(() => setMsg('No se pudo recortar la imagen.'))
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-black/80 pt-[10dvh] md:p-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Recortar imagen"
    >
      <div className="dialogo w-full max-w-lg flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="border-b pb-2 flex items-center justify-between">
          <h3 className="display text-xl font-bold">Recortar imagen</h3>
          <button onClick={onCancel} className={btnSec}><Icon name="x" size={15} /> Cerrar</button>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="t-muted">Proporción:</span>
            {Object.entries(RATIOS).map(([k, v]) => (
              <button
                key={k}
                onClick={() => setRatio(k as Ratio)}
                className={`touch-btn rounded px-2 py-1 text-xs border ${ratio === k ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 't-surface t-hover'}`}
              >
                {v.label}
              </button>
            ))}
            <button onClick={girar} className="touch-btn rounded px-2 py-1 text-xs border t-surface t-hover" title="Girar 90°"><Icon name="rotate" size={13} /></button>
          </div>
          <div
            ref={contRef}
            className="relative overflow-hidden rounded-xl border-2 border-[var(--accent)] bg-slate-200"
            style={{ aspectRatio: RATIOS[ratio].r }}
            onPointerDown={onPointerDown}
          >
            {img && dw > 0 && dh > 0 && (
              <div
                className="absolute"
                style={{
                  width: dw,
                  height: dh,
                  transform: `translate(${tx}px, ${ty}px)`,
                  transformOrigin: '0 0',
                  cursor: 'grab',
                  userSelect: 'none',
                  touchAction: 'none',
                }}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              >
                <img src={src} style={{ width: '100%', height: '100%', display: 'block' }} alt="Recorte" />
              </div>
            )}
          </div>
          {msg && <p className="text-[var(--warn-bg)] text-xs font-semibold">{msg}</p>}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onCancel} className={btnSec}>Cancelar</button>
          <button onClick={aplicar} className={`${btnPri} flex items-center gap-2`}><Icon name="check" size={15} /> Aplicar recorte</button>
        </div>
      </div>
    </div>
  )
}
