// Entrada del worker de pdf.js: primero el polyfill (el worker tiene su propio
// ámbito, no hereda el de la página) y después el motor, que se registra solo.
import './pdfCompat'
import 'pdfjs-dist/legacy/build/pdf.worker.min.mjs'
