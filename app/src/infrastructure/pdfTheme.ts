// Tema institucional compartido para los PDF.
// Carta 612x792pt, encabezado y pie institucionales en cada página.

import { PDFDocument, PDFFont, PDFImage, rgb, StandardFonts, type PDFPage, type RGB } from 'pdf-lib'
import { recortarBordes } from './imageOptimizer'

export const CARTA_W = 612
export const CARTA_H = 792
/** Márgenes reales del .docx FO-205P11000-14 (twips→pt). */
export const M_L = 62
export const M_R = 62
export const M_T = 66
export const M_B = 66
export const CONTENT_W = CARTA_W - M_L - M_R // 488
export const HEADER_H = 66
export const FOOTER_H = 26

export const AZUL_TESCI = rgb(0.09, 0.2, 0.36)
export const GRANATE = rgb(0.45, 0.12, 0.18)
export const GRIS = rgb(0.32, 0.32, 0.32)
export const NEGRO = rgb(0, 0, 0)
export const FONDO_ETIQUETA = rgb(0.93, 0.94, 0.96)
export const FONDO_CODIGO = rgb(0.11, 0.13, 0.17)

export const PIE_DIRECCION =
  'Av. Nopaltepec s/n, Col. La Perla, C. P. 54740, Cuautitlán Izcalli, Estado de México. Tels.: 55 5864 31 70 y 55 5864 31 71    Página web: tesci.edomex.gob.mx'

export function baseUrl(): string {
  try {
    return (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './'
  } catch {
    return './'
  }
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    return new Uint8Array(await r.arrayBuffer())
  } catch {
    return null
  }
}

export interface Tema {
  doc: PDFDocument
  helv: PDFFont
  helvB: PDFFont
  helvI: PDFFont
  cour: PDFFont
  courB: PDFFont
  headerImg?: PDFImage
  footerImg?: PDFImage
}

export async function crearTema(doc: PDFDocument): Promise<Tema> {
  const [helv, helvB, helvI, cour, courB] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.HelveticaOblique),
    doc.embedFont(StandardFonts.Courier),
    doc.embedFont(StandardFonts.CourierBold),
  ])
  const [hBytes, fBytes] = await Promise.all([
    fetchBytes(`${baseUrl()}membretes/tesci-header.png`),
    fetchBytes(`${baseUrl()}membretes/tesci-footer.png`),
  ])
  let headerImg: PDFImage | undefined
  let footerImg: PDFImage | undefined
  try {
    // Recorte de aire lateral para usar el ancho completo.
    if (hBytes) headerImg = await doc.embedPng((await recortarBordes(hBytes)).bytes)
  } catch { /* noop */ }
  try {
    if (fBytes) footerImg = await doc.embedPng((await recortarBordes(fBytes)).bytes)
  } catch { /* noop */ }
  return { doc, helv, helvB, helvI, cour, courB, headerImg, footerImg }
}

/** Ajuste por aspecto: cabe en la caja sin deformar (nunca estira). */
export function encajar(w: number, h: number, maxW: number, maxH: number): { w: number; h: number } {
  const r = Math.min(maxW / w, maxH / h)
  return { w: w * r, h: h * r }
}

/** Dibuja encabezado y pie institucionales. Devuelve la Y útil. */
export function dibujarMembretes(t: Tema, page: PDFPage, opts?: { sinFooter?: boolean; numero?: number; total?: number }): number {
  if (t.headerImg) {
    // Banner panorámico centrado con altura objetivo.
    const d = encajar(t.headerImg.width, t.headerImg.height, CARTA_W - 56, HEADER_H)
    page.drawImage(t.headerImg, { x: (CARTA_W - d.w) / 2, y: CARTA_H - 14 - d.h, width: d.w, height: d.h })
  }
  if (!opts?.sinFooter) {
    if (t.footerImg) {
      const d = encajar(t.footerImg.width, t.footerImg.height, CARTA_W - 120, FOOTER_H)
      page.drawImage(t.footerImg, { x: (CARTA_W - d.w) / 2, y: 12, width: d.w, height: d.h })
    } else {
      const f = t.helv
      for (const [i, ln] of PIE_DIRECCION.match(/.{1,105}(\s|$)/g)!.map((s) => s.trim()).entries()) {
        const w = f.widthOfTextAtSize(ln, 6)
        page.drawText(ln, { x: (CARTA_W - w) / 2, y: 26 - i * 8, size: 6, font: f, color: GRIS })
      }
    }
  }
  if (opts?.numero !== undefined) {
    const s = `${opts.numero}${opts.total ? ` / ${opts.total}` : ''}`
    page.drawText(s, { x: CARTA_W - M_R - t.helv.widthOfTextAtSize(s, 7), y: M_B - 22, size: 7, font: t.helv, color: GRIS })
  }
  return CARTA_H - M_T - HEADER_H - 4
}

/** Página carta con membretes. Devuelve Y inicial del área de contenido. */
export function paginaConMembrete(t: Tema, opts?: { sinFooter?: boolean; numero?: number; total?: number }): { page: PDFPage; y: number } {
  const page = t.doc.addPage([CARTA_W, CARTA_H])
  return { page, y: dibujarMembretes(t, page, opts) }
}

export function wrap(texto: string, font: PDFFont, size: number, maxW: number): string[] {
  // Respeta saltos explícitos: cada línea se envuelve por separado (listas escalonadas).
  const out: string[] = []
  for (const parte of sanearWinAnsi(texto).split('\n')) {
    if (!parte.trim()) out.push('')
    else out.push(...wrapLinea(parte, font, size, maxW))
  }
  return out.length ? out : ['']
}

/**
 * Deja solo caracteres imprimibles en WinAnsi (pdf-lib revienta con otros,
 * p. ej. el artefacto `☹` que algunos .docx traen en `Competencia No. :(`).
 * Conserva acentos, eñes y puntuación habitual (–—‘’“”…•).
 */
const EXTRA_WINANSI = '‘’‚‛“”„‟–—―…•·°©®™§¶±×÷¡¿ŒœŠšŸž€†‡‰‹›'
export function sanearWinAnsi(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (c === 0x0a || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRA_WINANSI.includes(ch)) out += ch
  }
  return out
}

function wrapLinea(texto: string, font: PDFFont, size: number, maxW: number): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean)
  const lineas: string[] = []
  let cur = ''
  for (const w of palabras) {
    const t = cur ? cur + ' ' + w : w
    if (font.widthOfTextAtSize(t, size) > maxW && cur) {
      lineas.push(cur)
      cur = w
      // palabra más ancha que la línea: cortarla
      while (font.widthOfTextAtSize(cur, size) > maxW && cur.length > 1) {
        let k = cur.length - 1
        while (k > 1 && font.widthOfTextAtSize(cur.slice(0, k), size) > maxW) k--
        lineas.push(cur.slice(0, k))
        cur = cur.slice(k)
      }
    } else cur = t
  }
  if (cur) lineas.push(cur)
  return lineas
}

export interface Flujo {
  t: Tema
  page: PDFPage
  y: number
  /** Y inicial de cada página (tras membretes). */
  yInicial: number
  sinFooter?: boolean
}

export function nuevoFlujo(t: Tema, sinFooter?: boolean): Flujo {
  const { page, y } = paginaConMembrete(t, sinFooter ? { sinFooter } : undefined)
  return { t, page, y, yInicial: y, sinFooter }
}

export function asegurar(f: Flujo, alto: number) {
  if (f.y - alto < M_B + FOOTER_H + 6) {
    const { page, y } = paginaConMembrete(f.t, f.sinFooter ? { sinFooter: true } : undefined)
    f.page = page
    f.y = y
    f.yInicial = y
  }
}

export function parrafo(f: Flujo, texto: string, opts?: { size?: number; font?: PDFFont; color?: RGB; inter?: number; x?: number; maxW?: number; justificado?: boolean }) {
  const size = opts?.size ?? 9.5
  const font = opts?.font ?? f.t.helv
  const maxW = opts?.maxW ?? (opts?.x !== undefined ? CARTA_W - M_R - opts.x : CONTENT_W)
  const x0 = opts?.x ?? M_L
  for (const ln of wrap(texto, font, size, maxW)) {
    asegurar(f, size + (opts?.inter ?? 2) + 2)
    f.page.drawText(ln, { x: x0, y: f.y - size, size, font, color: opts?.color ?? NEGRO })
    f.y -= size + (opts?.inter ?? 2)
  }
}

export function tituloCentrado(f: Flujo, texto: string, size: number, bold = true, color: RGB = NEGRO) {
  const font = bold ? f.t.helvB : f.t.helv
  asegurar(f, size + 8)
  const w = font.widthOfTextAtSize(texto.slice(0, 90), size)
  f.page.drawText(texto.slice(0, 90), { x: (CARTA_W - w) / 2, y: f.y - size, size, font, color })
  f.y -= size + 6
}

/** Dibuja una celda con borde + texto envuelto. Devuelve altura usada. */
export function celda(f: Flujo, x: number, yTop: number, w: number, lineas: string[], opts?: { size?: number; boldPrimera?: boolean; fondo?: RGB; centrado?: boolean }) {
  const size = opts?.size ?? 8
  const alto = Math.max(1, lineas.length) * (size + 2.4) + 6
  f.page.drawRectangle({ x, y: yTop - alto, width: w, height: alto, borderColor: NEGRO, borderWidth: 0.7, color: opts?.fondo })
  lineas.forEach((ln, i) => {
    const font = opts?.boldPrimera && i === 0 ? f.t.helvB : i === 0 && opts?.boldPrimera === undefined ? f.t.helv : f.t.helv
    void font
    const ff = f.t.helv
    const tw = ff.widthOfTextAtSize(ln, size)
    const tx = opts?.centrado ? x + (w - tw) / 2 : x + 3
    f.page.drawText(ln, { x: tx, y: yTop - size - 3.5 - i * (size + 2.4), size, font: ff })
  })
  return alto
}

/** Encabezado institucional con títulos (portadas y secciones). */
export function encabezadoPortada(f: Flujo, lineas: string[]) {
  tituloCentrado(f, lineas[0] ?? 'Tecnológico de Estudios Superiores de Cuautitlán Izcalli', 9, true, AZUL_TESCI)
  for (const ln of lineas.slice(1)) tituloCentrado(f, ln, 13, true)
}
