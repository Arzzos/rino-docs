// Infrastructure: optimización de imágenes pesadas.
// Riesgo: fotos de celular de 5-12MB rompen IndexedDB y el PDF.
// Estrategia sin pérdida perceptible: redimensionar a máx 1600px por lado,
// recomprimir JPEG 0.92 / WebP 0.9, preservar PNG con transparencia.
// Todo en cliente vía canvas. Si el archivo ya es pequeño, se deja intacto.

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

  // Si no necesita escala y pesa < 900KB, devolver original como dataURL
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
