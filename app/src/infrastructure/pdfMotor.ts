// Motor PDF compartido por el visor: pdf.js y su worker se cargan bajo
// demanda. El worker usa Iterator (ES2025): no debe evaluarse al importar
// el módulo (rompe Node 20 en CI) ni antes de abrir el visor.
import type * as PdfJs from 'pdfjs-dist'

let modulo: Promise<typeof PdfJs> | null = null

export function cargarPdfJs(): Promise<typeof PdfJs> {
  if (!modulo) modulo = import('pdfjs-dist')
  return modulo
}

export function crearObreroPdf(): Promise<Worker> {
  return import('pdfjs-dist/build/pdf.worker.min.mjs?worker').then((m) => new m.default())
}
