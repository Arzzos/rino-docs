// Motor PDF compartido por el visor: build legacy (compatible con Safari/iOS
// anteriores a 17.4) y su worker con el mismo polyfill. El worker no debe
// evaluarse al importar el módulo (rompe las pruebas en Node).
import './pdfCompat'
import type * as PdfJs from 'pdfjs-dist/legacy/build/pdf.mjs'

let modulo: Promise<typeof PdfJs> | null = null

export function cargarPdfJs(): Promise<typeof PdfJs> {
  if (!modulo) modulo = import('pdfjs-dist/legacy/build/pdf.mjs')
  return modulo
}

export function crearObreroPdf(): Promise<Worker> {
  return import('./pdfWorker.ts?worker').then((m) => new m.default())
}
