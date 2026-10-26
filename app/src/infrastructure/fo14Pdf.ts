// Exportación PDF del FO-205P11000-14.
// Rejilla de 9 columnas, equipo en el campo (5), imágenes ajustadas a carta
// y bloques de código con resaltado por lenguaje.

import { PDFDocument, rgb } from 'pdf-lib'
import type { Evidencia } from '../domain/types'
import { resaltarTokens, tokensPorLinea } from './codeHighlight'
import {
  AZUL_TESCI, CONTENT_W, FONDO_CODIGO, FONDO_ETIQUETA, GRIS, M_B, M_L, CARTA_W,
  NEGRO, asegurar, crearTema, nuevoFlujo, paginaConMembrete, parrafo, sanearWinAnsi, tituloCentrado, wrap, FOOTER_H,
  type Flujo,
} from './pdfTheme'

const FS = 8
const BLANCO = rgb(1, 1, 1)

interface Par { etiqueta: string; anchoEtiqueta: number; valor: string; anchoValor: number }

/** Dibuja una fila de pares etiqueta|valor. Etiqueta sombreada, valor blanco. */
function filaPares(f: Flujo, x0: number, pares: Par[]) {
  const med = pares.map((p) => {
    const etiq = wrap(p.etiqueta, f.t.helvB, FS, p.anchoEtiqueta - 6)
    const val = wrap(p.valor || '—', f.t.helv, FS, p.anchoValor - 6)
    return { etiq, val, n: Math.max(etiq.length, val.length, 1) }
  })
  const alto = Math.max(...med.map((m) => m.n)) * (FS + 2.4) + 6
  asegurar(f, alto + 1)
  const yTop = f.y
  let x = x0
  pares.forEach((p, i) => {
    const m = med[i]
    f.page.drawRectangle({ x, y: yTop - alto, width: p.anchoEtiqueta, height: alto, borderColor: NEGRO, borderWidth: 0.7, color: FONDO_ETIQUETA })
    m.etiq.forEach((ln, j) => {
      f.page.drawText(ln, { x: x + 3, y: yTop - FS - 3.5 - j * (FS + 2.4), size: FS, font: f.t.helvB, color: AZUL_TESCI })
    })
    const xv = x + p.anchoEtiqueta
    f.page.drawRectangle({ x: xv, y: yTop - alto, width: p.anchoValor, height: alto, borderColor: NEGRO, borderWidth: 0.7, color: BLANCO })
    m.val.forEach((ln, j) => {
      f.page.drawText(ln, { x: xv + 3, y: yTop - FS - 3.5 - j * (FS + 2.4), size: FS, font: f.t.helv })
    })
    x += p.anchoEtiqueta + p.anchoValor
  })
  f.y = yTop - alto
}

function hexAColor(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

export async function generarEvidenciaPDF(e: Evidencia, mapaIndicadores?: Record<string, string>): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`FO-205P11000-14 — ${e.nombreEvidencia}`)
  doc.setAuthor(`${e.alumnoNombre} ${e.numeroControl}`)
  // Creator persiste al guardar (la autoría vive solo en metadata).
  doc.setCreator('Rino Docs (offline-first)')
  const t = await crearTema(doc)
  const f = nuevoFlujo(t)
  const x0 = M_L + (CONTENT_W - 473.2) / 2
  const C = (a: number, b: number) => a + b // alias legible

  tituloCentrado(f, 'DIRECCIÓN ACADÉMICA', 10, true, AZUL_TESCI)
  tituloCentrado(f, 'Formato de entrega de evidencias', 11, true)
  tituloCentrado(f, 'FO-205P11000-14', 8, true, GRIS)
  f.y -= 4

  const nombres5 = [`${e.alumnoNombre} ${e.numeroControl}`.trim(), ...e.integrantes.map((x) => `${x.nombre} ${x.control}`.trim())].filter(Boolean).join('\n')
  // Indicador de alcance (9): uno por línea, letra + contenido.
  const indicadores9 = e.indicadoresSeleccionados
    .map((l) => (mapaIndicadores?.[l] ? `${l}) ${mapaIndicadores[l]}` : l))
    .join('\n')
  void C

  filaPares(f, x0, [
    { etiqueta: 'División: (1)', anchoEtiqueta: 76.25, valor: e.division, anchoValor: 283.55 },
    { etiqueta: 'Grupo: (2)', anchoEtiqueta: 49.6, valor: e.grupo, anchoValor: 63.8 },
  ])
  filaPares(f, x0, [
    { etiqueta: 'Asignatura: (3)', anchoEtiqueta: 76.25, valor: e.asignatura, anchoValor: 169.6 },
    { etiqueta: 'Docente: (4)', anchoEtiqueta: 64.25, valor: e.docente, anchoValor: 163.1 },
  ])
  filaPares(f, x0, [
    { etiqueta: 'Nombre y número de control: (5)', anchoEtiqueta: 218.05, valor: nombres5, anchoValor: 255.15 },
  ])
  filaPares(f, x0, [
    { etiqueta: 'Fecha de entrega: (6)', anchoEtiqueta: 218.05, valor: e.fechaEntrega, anchoValor: 255.15 },
  ])
  filaPares(f, x0, [
    { etiqueta: 'Competencia No.: (7)', anchoEtiqueta: 97.45, valor: e.competenciaNo, anchoValor: 42.55 },
    { etiqueta: 'Descripción: (8)', anchoEtiqueta: 78.05, valor: e.descripcionCompetencia, anchoValor: 255.15 },
  ])
  filaPares(f, x0, [
    { etiqueta: 'Indicador de alcance: (9)', anchoEtiqueta: 140, valor: indicadores9, anchoValor: 333.2 },
  ])
  filaPares(f, x0, [
    { etiqueta: 'Evidencia de aprendizaje: (10)', anchoEtiqueta: 140, valor: e.nombreEvidencia, anchoValor: 333.2 },
  ])
  f.y -= 8

  // Contenido
  for (const b of e.bloques) {
    if (b.tipo === 'texto') {
      for (const par of b.texto.split('\n')) {
        if (!par.trim()) { f.y -= 6; continue }
        parrafo(f, par, { size: 9.5, justificado: true })
        f.y -= 3
      }
    } else if (b.tipo === 'subtitulo') {
      asegurar(f, 22)
      f.page.drawText(sanearWinAnsi(b.texto).slice(0, 100), { x: M_L, y: f.y - 11, size: 11, font: f.t.helvB })
      f.y -= 20
    } else if (b.tipo === 'salto') {
      const { page, y } = paginaConMembrete(f.t, f.sinFooter ? { sinFooter: true } : undefined)
      f.page = page
      f.y = y
      f.yInicial = y
    } else if (b.tipo === 'codigo') {
      dibujarCodigo(f, b.lenguaje, b.texto)
    } else if (b.tipo === 'tabla') {
      dibujarTabla(f, b.encabezados, b.filas)
    } else if (b.tipo === 'imagen') {
      await dibujarImagen(f, doc, b.dataUrl, b.pie, b.anchoPct, b.escala)
    } else if (b.tipo === 'referencia') {
      parrafo(f, (b.url ? `${b.texto} ${b.url}` : b.texto).trim(), { size: 8.5, color: GRIS, font: f.t.helvI })
      f.y -= 3
    }
  }

  f.y -= 6
  // Sin marcas en el contenido: la autoría va solo en metadata.

  return doc.save()
}

function dibujarCodigo(f: Flujo, lenguaje: string, codigo: string) {
  const lineas = tokensPorLinea(resaltarTokens(sanearWinAnsi(codigo), lenguaje as never, true))
  const size = 7.5
  const lh = size + 3.4
  const numW = 30
  const maxX = M_L + CONTENT_W - 4
  const fondo = () => f.page.drawRectangle({ x: M_L, y: f.y - lh, width: CONTENT_W, height: lh + 2, color: FONDO_CODIGO })
  const barra = () => {
    asegurar(f, 18)
    f.page.drawRectangle({ x: M_L, y: f.y - 16, width: CONTENT_W, height: 16, color: rgb(0.16, 0.2, 0.27) })
    f.page.drawText(lenguaje.toUpperCase(), { x: M_L + 8, y: f.y - 12.5, size: 8, font: f.t.courB, color: rgb(1, 0.85, 0.4) })
    f.y -= 16
  }
  barra()
  lineas.forEach((toks, idx) => {
    asegurar(f, lh + 2)
    fondo()
    const num = String(idx + 1)
    f.page.drawText(num, { x: M_L + numW - 6 - f.t.cour.widthOfTextAtSize(num, size), y: f.y - size - 1, size, font: f.t.cour, color: rgb(0.45, 0.5, 0.6) })
    let x = M_L + numW
    const encajar = (txt: string): number => {
      let k = txt.length
      while (k > 0 && f.t.cour.widthOfTextAtSize(txt.slice(0, k), size) > maxX - x) k--
      return Math.max(k, 1)
    }
    for (const tk of toks) {
      let rest = tk.texto
      const color = hexAColor(tk.color)
      while (rest) {
        if (f.t.cour.widthOfTextAtSize(rest, size) <= maxX - x) {
          f.page.drawText(rest, { x, y: f.y - size - 1, size, font: f.t.cour, color })
          x += f.t.cour.widthOfTextAtSize(rest, size)
          break
        }
        const k = encajar(rest)
        f.page.drawText(rest.slice(0, k), { x, y: f.y - size - 1, size, font: f.t.cour, color })
        rest = rest.slice(k)
        f.y -= lh
        asegurar(f, lh + 2)
        fondo()
        x = M_L + numW
      }
    }
    f.y -= lh
  })
  f.y -= 8
}

function dibujarTabla(f: Flujo, encabezados: string[], filas: string[][]) {
  const cols = Math.max(1, encabezados.length)
  const cw = CONTENT_W / cols
  const size = 7.5
  const todo = [encabezados, ...filas]
  for (let ri = 0; ri < todo.length; ri++) {
    const celdas = todo[ri].map((c, ci) => wrap(String(ci < todo[ri].length ? c : ''), ri === 0 ? f.t.helvB : f.t.helv, size, cw - 6))
    const alto = Math.max(1, ...celdas.map((c) => c.length)) * (size + 2.4) + 6
    asegurar(f, alto + 1)
    const yTop = f.y
    celdas.forEach((lns, ci) => {
      const x = M_L + ci * cw
      f.page.drawRectangle({ x, y: yTop - alto, width: cw, height: alto, borderColor: NEGRO, borderWidth: 0.6, color: ri === 0 ? FONDO_ETIQUETA : undefined })
      lns.forEach((ln, j) => {
        f.page.drawText(ln, { x: x + 3, y: yTop - size - 3.5 - j * (size + 2.4), size, font: ri === 0 ? f.t.helvB : f.t.helv })
      })
    })
    f.y = yTop - alto
  }
  f.y -= 6
}

/** Dibuja una imagen ajustada a carta con los ajustes del usuario. */
export async function dibujarImagen(f: Flujo, doc: PDFDocument, dataUrl: string, pie: string | undefined, anchoPct: number, escala: number) {
  const { dataUrlToBytes: conv } = await import('./imageOptimizer')
  const { bytes, esPng } = conv(dataUrl)
  let img
  try { img = esPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes) }
  catch { try { img = esPng ? await doc.embedJpg(bytes) : await doc.embedPng(bytes) } catch { return } }
  const ratio = img.height / img.width
  const pct = Math.min(100, Math.max(25, anchoPct || 100))
  const esc = Math.min(1, Math.max(0.25, escala || 1))
  // Hueco que consume la imagen con su pie al bajar el flujo (4 + 13 + 5 o 4 + 5).
  const minY = M_B + FOOTER_H + (pie ? 24 : 10)
  const disp = f.y - minY
  const paginaLlena = Math.max(1, (f.yInicial ?? f.y) - minY)
  // La decisión se toma midiendo la imagen, no con un umbral de hoja:
  // si la altura dibujable cabe donde está el flujo, se queda ahí aunque
  // la tabla de datos haya consumido la mayor parte de la página.
  const wUser = (CONTENT_W * pct) / 100
  const hUser = wUser * ratio
  let h = Math.min(hUser, paginaLlena * esc)
  if (h > disp) {
    // Una imagen que apenas se pasa se encoge y se queda: moverla a otra hoja
    // cuesta una página entera. Solo salta si la diferencia es grande o si
    // el hueco no da ni para una figura legible.
    const perdidaModerada = disp >= 60 && h <= disp * 1.3
    if (disp >= paginaLlena * 0.55 || perdidaModerada) {
      h = disp
    } else {
      // La imagen no cabe en lo que resta de hoja: pasa a hoja nueva completa.
      const { page, y } = (await import('./pdfTheme')).paginaConMembrete(f.t)
      f.page = page
      f.y = y
      f.yInicial = y
      h = Math.min(hUser, (y - minY) * esc)
    }
  }
  const w = h / ratio
  const x = M_L + (CONTENT_W - w) / 2
  f.page.drawImage(img, { x, y: f.y - h, width: w, height: h })
  f.y -= h + 4
  if (pie) {
    asegurar(f, 12)
    const txt = sanearWinAnsi(pie).slice(0, 100)
    const pw = f.t.helvI.widthOfTextAtSize(txt, 7.5)
    f.page.drawText(txt, { x: (CARTA_W - pw) / 2, y: f.y - 8, size: 7.5, font: f.t.helvI, color: GRIS })
    f.y -= 13
  }
  f.y -= 5
}

/** Mapa letra → descripción desde la instrumentación (campo 9). */
export function mapaDeIndicadores(
  ev: Evidencia,
  inst?: { competencias: { numero: string; indicadores: { letra: string; descripcion: string }[] }[] },
): Record<string, string> {
  const m: Record<string, string> = {}
  inst?.competencias.find((c) => c.numero === ev.competenciaNo)?.indicadores.forEach((i) => { m[i.letra] = i.descripcion })
  return m
}

export function descargarPDF(bytes: Uint8Array, nombre: string) {  const blob = new Blob([bytes.slice()], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre.endsWith('.pdf') ? nombre : nombre + '.pdf'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(url); a.remove() }, 800)
}

export function pdfAUrl(bytes: Uint8Array): string {
  return URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/pdf' }))
}
