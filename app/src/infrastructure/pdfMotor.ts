// Motor PDF compartido por el visor: importa pdf.js una vez y crea un worker
// empaquetado por instancia (fiable offline y en PWA instalada).
import type * as PdfJs from 'pdfjs-dist'
import ObreroPdf from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'

let modulo: Promise<typeof PdfJs> | null = null

export function cargarPdfJs(): Promise<typeof PdfJs> {
  if (!modulo) modulo = import('pdfjs-dist')
  return modulo
}

export function crearObreroPdf(): Worker {
  return new ObreroPdf()
}
