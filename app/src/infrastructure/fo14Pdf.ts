// Infrastructure: motor de exportación PDF FO-205P11000-14 (réplica exacta).
// Client-side con pdf-lib. Letter portrait 612x792pt, márgenes del .docx real:
// top/bottom 70.85pt, laterales 85.05pt. Membretes PNG del header/footer original.
// Primera imagen contenida para no desalinear membretes; resto en flujo libre.

import { PDFDocument, PDFFont, PDFImage, rgb, type PDFPage } from 'pdf-lib'
import type { Evidencia } from '../domain/types'
import { dataUrlToBytes } from './imageOptimizer'

const LETTER_W = 612
const LETTER_H = 792
const M_L = 85.05
const M_R = 85.05
const M_T = 70.85
const M_B = 70.85
const HEADER_H = 52
const FOOTER_H = 34
const AZUL = rgb(0.12, 0.23, 0.37)
const GRIS = rgb(0.35, 0.35, 0.35)
const NEGRO = rgb(0, 0, 0)

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    return new Uint8Array(await r.arrayBuffer())
  } catch {
    return null
  }
}

interface Ctx {
  doc: PDFDocument
  helv: PDFFont
  helvB: PDFFont
  cour: PDFFont
  page: PDFPage
  y: number
  primeraPagina: boolean
  primeraImagenUsada: boolean
}

function nuevaPagina(c: Ctx, headerImg?: PDFImage, footerImg?: PDFImage) {
  c.page = c.doc.addPage([LETTER_W, LETTER_H])
  c.y = LETTER_H - M_T
  dibujarMembretes(c, headerImg, footerImg)
  c.primeraPagina = false
}

function dibujarMembretes(c: Ctx, headerImg?: PDFImage, footerImg?: PDFImage) {
  const p = c.page
  if (headerImg) {
    const w = LETTER_W - 40
    const h = w * (headerImg.height / headerImg.width)
    const hh = Math.min(h, HEADER_H)
    p.drawImage(headerImg, { x: 20, y: LETTER_H - 12 - hh, width: w, height: hh })
  }
  if (footerImg) {
    const w = LETTER_W - 40
    const h = w * (footerImg.height / footerImg.width)
    const fh = Math.min(h, FOOTER_H)
    p.drawImage(footerImg, { x: 20, y: 10, width: w, height: fh })
  }
}

function wrap(texto: string, font: PDFFont, size: number, maxW: number): string[] {
  const palabras = texto.split(/\s+/)
  const lineas: string[] = []
  let cur = ''
  for (const w of palabras) {
    const t = cur ? cur + ' ' + w : w
    if (font.widthOfTextAtSize(t, size) > maxW && cur) {
      lineas.push(cur)
      cur = w
    } else cur = t
  }
  if (cur) lineas.push(cur)
  return lineas
}

function asegurar(c: Ctx, alto: number, hi?: PDFImage, fi?: PDFImage) {
  const limite = M_B + 20
  if (c.y - alto < limite) nuevaPagina(c, hi, fi)
}

function texto(c: Ctx, t: string, size: number, font: PDFFont, color = NEGRO, inter = 2, x?: number) {
  const maxW = LETTER_W - M_L - M_R
  for (const ln of wrap(t, font, size, x !== undefined ? LETTER_W - M_R - x : maxW)) {
    asegurar(c, size + inter + 2, undefined, undefined)
    c.page.drawText(ln, { x: x ?? M_L, y: c.y - size, size, font, color })
    c.y -= size + inter
  }
}

function filaCampo(c: Ctx, etiqueta: string, valor: string) {
  const maxW = LETTER_W - M_L - M_R
  const fs = 8.2
  const label = etiqueta + ' '
  const lw = c.helvB.widthOfTextAtSize(label, fs)
  const lineas = wrap(valor || '—', c.helv, fs, maxW - lw)
  const alto = Math.max(1, lineas.length) * (fs + 2) + 5
  asegurar(c, alto)
  const yTop = c.y
  // fondo etiqueta sutil + bordes
  c.page.drawRectangle({ x: M_L, y: yTop - alto, width: maxW, height: alto, borderColor: NEGRO, borderWidth: 0.7 })
  c.page.drawText(label, { x: M_L + 4, y: yTop - fs - 3.5, size: fs, font: c.helvB, color: AZUL })
  lineas.forEach((ln, i) => {
    c.page.drawText(ln, { x: M_L + 4 + (i === 0 ? lw : 0), y: yTop - fs - 3.5 - i * (fs + 2), size: fs, font: c.helv })
  })
  if (lineas.length === 0) c.y = yTop - alto
  else c.y = yTop - alto
  c.y -= 3
}

export async function generarEvidenciaPDF(e: Evidencia): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`FO-205P11000-14 — ${e.nombreEvidencia}`)
  doc.setAuthor(`${e.alumnoNombre} ${e.numeroControl}`)
  const helv = await doc.embedFont((await import('pdf-lib')).StandardFonts.Helvetica)
  const helvB = await doc.embedFont((await import('pdf-lib')).StandardFonts.HelveticaBold)
  const cour = await doc.embedFont((await import('pdf-lib')).StandardFonts.Courier)

  const [hBytes, fBytes] = await Promise.all([
    fetchBytes(`${import.meta.env.BASE_URL}membretes/tesci-header.png`),
    fetchBytes(`${import.meta.env.BASE_URL}membretes/tesci-footer.png`),
  ])
  const headerImg = hBytes ? await doc.embedPng(hBytes) : undefined
  const footerImg = fBytes ? await doc.embedPng(fBytes) : undefined

  const c: Ctx = { doc, helv, helvB, cour, page: doc.addPage([LETTER_W, LETTER_H]), y: LETTER_H - M_T, primeraPagina: true, primeraImagenUsada: false }
  dibujarMembretes(c, headerImg, footerImg)
  c.y -= (HEADER_H + 6)

  // Títulos institucionales
  const centrado = (t: string, size: number, bold = false, color = NEGRO) => {
    const f = bold ? helvB : helv
    const w = f.widthOfTextAtSize(t, size)
    asegurar(c, size + 6)
    c.page.drawText(t, { x: (LETTER_W - w) / 2, y: c.y - size, size, font: f, color })
    c.y -= size + 5
  }
  centrado('DIRECCIÓN ACADÉMICA', 10, true, AZUL)
  centrado('Formato de entrega de evidencias', 11, true)
  centrado('FO-205P11000-14', 8, true, GRIS)
  c.y -= 4

  // Tabla de 10 campos (réplica del .docx)
  filaCampo(c, 'División: (1)', e.division)
  filaCampo(c, 'Grupo: (2)', e.grupo)
  filaCampo(c, 'Asignatura: (3)', e.asignatura)
  filaCampo(c, 'Docente: (4)', e.docente)
  filaCampo(c, 'Nombre y número de control: (5)', `${e.alumnoNombre} — ${e.numeroControl}`)
  filaCampo(c, 'Fecha de entrega: (6)', e.fechaEntrega)
  filaCampo(c, 'Competencia No.: (7)', e.competenciaNo)
  filaCampo(c, 'Descripción: (8)', e.descripcionCompetencia)
  filaCampo(c, 'Indicador de alcance: (9)', e.indicadoresSeleccionados.join(', '))
  filaCampo(c, 'Evidencia de aprendizaje: (10)', e.nombreEvidencia)
  c.y -= 6

  // Contenido modular
  const maxW = LETTER_W - M_L - M_R
  for (const b of e.bloques) {
    if (b.tipo === 'texto') {
      for (const par of b.texto.split('\n')) {
        if (!par.trim()) { c.y -= 6; continue }
        texto(c, par, 9.5, helv)
        c.y -= 3
      }
    } else if (b.tipo === 'codigo') {
      const lineas = b.texto.split('\n')
      const alto = lineas.length * 11 + 12
      asegurar(c, Math.min(alto, 400))
      // fondo gris
      const h = Math.min(alto, c.y - (M_B + 20))
      void h
      c.page.drawRectangle({ x: M_L, y: c.y - 6 - lineas.length * 11, width: maxW, height: lineas.length * 11 + 10, color: rgb(0.95, 0.95, 0.96), borderColor: GRIS, borderWidth: 0.5 })
      c.y -= 8
      for (const ln of lineas) {
        if (c.y < M_B + 24) nuevaPagina(c, headerImg, footerImg)
        const recortada = ln.slice(0, 110)
        c.page.drawText(recortada, { x: M_L + 5, y: c.y - 9, size: 8, font: cour })
        c.y -= 11
      }
      c.y -= 8
    } else if (b.tipo === 'tabla') {
      const cols = b.encabezados.length
      const cw = maxW / Math.max(1, cols)
      const filas = [b.encabezados, ...b.filas]
      for (let ri = 0; ri < filas.length; ri++) {
        asegurar(c, 16)
        filas[ri].forEach((cell, ci) => {
          const x = M_L + ci * cw
          c.page.drawRectangle({ x, y: c.y - 14, width: cw, height: 15, borderColor: NEGRO, borderWidth: 0.6, color: ri === 0 ? rgb(0.88, 0.91, 0.95) : undefined })
          c.page.drawText(String(cell).slice(0, 40), { x: x + 3, y: c.y - 11, size: 7.5, font: ri === 0 ? helvB : helv })
        })
        c.y -= 15
      }
      c.y -= 6
    } else if (b.tipo === 'imagen') {
      const { bytes, esPng } = dataUrlToBytes(b.dataUrl)
      const img = esPng ? await doc.embedPng(bytes).catch(() => doc.embedJpg(bytes)) : await doc.embedJpg(bytes).catch(() => doc.embedPng(bytes))
      const ratio = img.height / img.width
      // Regla anti-membrete: primera imagen de la primera página contenida
      const esPrimera = c.primeraPagina && !c.primeraImagenUsada
      const altoMax = esPrimera ? 200 : LETTER_H - M_T - M_B - 120
      let w = maxW
      let h = w * ratio
      if (h > altoMax) { h = altoMax; w = h / ratio }
      asegurar(c, h + 18)
      c.page.drawImage(img, { x: M_L + (maxW - w) / 2, y: c.y - h, width: w, height: h })
      c.y -= h + 4
      if (b.pie) {
        asegurar(c, 12)
        const pw = helv.widthOfTextAtSize(b.pie.slice(0, 90), 7.5)
        c.page.drawText(b.pie.slice(0, 90), { x: (LETTER_W - pw) / 2, y: c.y - 8, size: 7.5, font: helv, color: GRIS })
        c.y -= 12
      }
      c.y -= 4
      c.primeraImagenUsada = true
      void esPrimera
    } else if (b.tipo === 'referencia') {
      texto(c, (b.url ? `${b.texto} — ${b.url}` : b.texto), 8.5, helv, GRIS)
      c.y -= 2
    }
  }

  // Pie institucional
  c.y -= 8
  asegurar(c, 24)
  const pie = 'Documento generado localmente con Rino Docs (offline-first) — FO-205P11000-14'
  const pw = helv.widthOfTextAtSize(pie, 7)
  c.page.drawText(pie, { x: (LETTER_W - pw) / 2, y: Math.max(c.y, M_B + 20), size: 7, font: helv, color: GRIS })

  return doc.save()
}

export function descargarPDF(bytes: Uint8Array, nombre: string) {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre.endsWith('.pdf') ? nombre : nombre + '.pdf'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(url); a.remove() }, 800)
}
