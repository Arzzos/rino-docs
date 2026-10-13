// Optimización de imágenes en el cliente (canvas).
// Redimensiona a máx 1600px por lado y recomprime JPEG/WebP;
// preserva PNG con transparencia. Archivos pequeños se dejan intactos.

export interface OptimizedImage {
  dataUrl: string
  ancho: number
  alto: number
  bytesAprox: number
  formato: string
}

const MAX_LADO = 1600
const JPEG_Q = 0.92

export async function optimizarImagen(file: File | Blob): Promise<OptimizedImage> {
  const bitmap = await createImageBitmap(file)
  let { width, height } = bitmap
  const escala = Math.min(1, MAX_LADO / Math.max(width, height))
  const w = Math.round(width * escala)
  const h = Math.round(height * escala)

  // Archivo pequeño sin escala: se devuelve el original.
  if (escala === 1 && file.size < 900 * 1024) {
    const dataUrl = await blobToDataUrl(file)
    bitmap.close()
    return { dataUrl, ancho: width, alto: height, bytesAprox: file.size, formato: file.type }
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) throw new Error('Canvas no disponible')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const tieneAlpha = await detectaAlpha(canvas)
  const mime = tieneAlpha ? 'image/png' : 'image/jpeg'
  const dataUrl = canvas.toDataURL(mime, JPEG_Q)
  const bytesAprox = Math.round((dataUrl.length * 3) / 4)
  return { dataUrl, ancho: w, alto: h, bytesAprox, formato: mime }
}

/** Gira 90° en sentido horario un dataURL (las dimensiones se intercambian). */
export async function rotar90(dataUrl: string): Promise<{ dataUrl: string; ancho: number; alto: number }> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const el = new Image()
    el.onload = () => res(el)
    el.onerror = rej
    el.src = dataUrl
  })
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalHeight
  canvas.height = img.naturalWidth
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) throw new Error('Canvas no disponible')
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(Math.PI / 2)
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
  const esPng = dataUrl.includes('png') || dataUrl.includes('webp') || (await detectaAlpha(canvas))
  const out = canvas.toDataURL(esPng ? 'image/png' : 'image/jpeg', JPEG_Q)
  return { dataUrl: out, ancho: canvas.width, alto: canvas.height }
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(b)
  })
}

async function detectaAlpha(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    // Muestreo barato: revisa 2000 píxeles
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false
    const sw = Math.min(canvas.width, 64)
    const sh = Math.min(canvas.height, 64)
    const d = ctx.getImageData(0, 0, sw, sh).data
    for (let i = 3; i < d.length; i += 4) {
      if (d[i] < 250) return true
    }
    return false
  } catch {
    return false
  }
}

/** Convierte dataURL a bytes para pdf-lib */
export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; esPng: boolean } {
  const [head, b64] = dataUrl.split(',')
  const esPng = head.includes('png') || head.includes('webp')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, esPng }
}

export interface Recorte {
  bytes: Uint8Array
  /** Fracción horizontal conservada [x0, x1] para reescalar el extent. */
  fx0: number
  fx1: number
  /** Fracción vertical conservada [y0, y1] para reescalar el extent. */
  fy0: number
  fy1: number
}

/**
 * Recorta bordes blancos/transparentes de membretes (los PNG institucionales
 * traen los logos centrados con márgenes vacíos). Solo navegador (canvas);
 * en otros entornos devuelve los bytes intactos. Nunca altera el contenido.
 */
export async function recortarBordes(bytes: Uint8Array): Promise<Recorte> {
  const intacto = { bytes, fx0: 0, fx1: 1, fy0: 0, fy1: 1 }
  try {
    if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return intacto
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'image/png' })
    const bmp = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bmp.width
    canvas.height = bmp.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) { bmp.close(); return intacto }
    ctx.drawImage(bmp, 0, 0)
    bmp.close()
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let x0 = width, y0 = height, x1 = -1, y1 = -1
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        const a = data[i + 3]
        const lum = (data[i] + data[i + 1] + data[i + 2]) / 3
        if (a > 10 && lum < 245) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
      }
    }
    if (x1 < 0) return intacto
    const pad = 6
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad)
    x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad)
    const area = ((x1 - x0 + 1) * (y1 - y0 + 1)) / (width * height)
    if (area > 0.95) return intacto // ya es full-bleed
    const out = document.createElement('canvas')
    out.width = x1 - x0 + 1
    out.height = y1 - y0 + 1
    out.getContext('2d')!.drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
    const b64 = out.toDataURL('image/png').split(',')[1]
    const bin = atob(b64)
    const u = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
    return { bytes: u, fx0: x0 / width, fx1: (x1 + 1) / width, fy0: y0 / height, fy1: (y1 + 1) / height }
  } catch {
    return intacto
  }
}
