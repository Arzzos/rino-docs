// Renderizado de instrumentaciones .docx a páginas PDF.
// Recorre document.xml en orden, respeta tamaño y márgenes de página,
// dibuja membretes en cada página y ajusta tablas e imágenes al ancho.

import JSZip from 'jszip'
import { PDFDocument, PDFImage, rgb, type PDFPage } from 'pdf-lib'
import type { Tema } from './pdfTheme'
import { crearTema, sanearWinAnsi } from './pdfTheme'
import { base64ABytes } from './instrumentParser'
import { recortarBordes } from './imageOptimizer'

/** Pasa bytes a base64 por bloques (evita stack overflow en archivos grandes). */
export function bytesABase64(buf: Uint8Array): string {
  let s = ''
  for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192))
  return btoa(s)
}

/** Convierte el DOCX a PDF una vez al cargarlo; el portafolio copia páginas. */
export async function preRenderInstrumentacion(
  originalBase64: string,
  onProgreso?: (m: string) => void,
): Promise<{ pdfBase64: string; paginas: number; bytes: number }> {
  const doc = await PDFDocument.create()
  doc.setCreator('Rino Docs (offline-first)')
  const t = await crearTema(doc)
  const n = await renderDocxInstrumentacion(doc, t, originalBase64, onProgreso)
  const bytes = await doc.save()
  return { pdfBase64: bytesABase64(bytes), paginas: n, bytes: bytes.length }
}

/** Aligera imágenes pesadas del .docx (máx 1600px; PNG solo con alfa). */
async function limitarPeso(bytes: Uint8Array, ext: string): Promise<{ bytes: Uint8Array; ext: string }> {
  try {
    if (bytes.length < 700 * 1024) return { bytes, ext }
    if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return { bytes, ext }
    const bmp = await createImageBitmap(new Blob([bytes.buffer as ArrayBuffer], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` }))
    const max = Math.max(bmp.width, bmp.height)
    if (max <= 1600) { bmp.close(); return { bytes, ext } }
    const esc = 1600 / max
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * esc)
    c.height = Math.round(bmp.height * esc)
    const ctx = c.getContext('2d')!
    ctx.drawImage(bmp, 0, 0, c.width, c.height)
    const px = ctx.getImageData(0, 0, c.width, c.height).data
    let alfa = false
    for (let i = 3; i < px.length; i += 1600) {
      if (px[i] < 250) { alfa = true; break }
    }
    const mime = alfa || ext === 'png' ? 'image/png' : 'image/jpeg'
    const b64 = c.toDataURL(mime, 0.85).split(',')[1]
    bmp.close()
    const bin = atob(b64)
    const u = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
    return { bytes: u, ext: alfa ? 'png' : 'jpg' }
  } catch {
    return { bytes, ext }
  }
}

export interface ParteMembrete {
  tipo: string // default | first
  archivo: string
  imagenes: { bytes: Uint8Array; ext: string; wPt: number; hPt: number }[]
  texto: string
}

export interface MembretesDocx {
  headers: ParteMembrete[]
  footers: ParteMembrete[]
}

/** Lee un .rels de forma tolerante al orden de atributos. */
export async function leerRelsMapa(zip: JSZip, relsPath: string): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const f = zip.file(relsPath)
  if (!f) return map
  const x = await f.async('string')
  for (const m of x.matchAll(/<Relationship\b[^>]*>/g)) {
    const tag = m[0]
    const id = tag.match(/\bId="([^"]+)"/)?.[1]
    const tgt = tag.match(/\bTarget="([^"]+)"/)?.[1]
    if (id && tgt) map.set(id, tgt.replace(/^\//, ''))
  }
  return map
}

/** Extrae los membretes propios del .docx (portada y resto por separado). */
export async function extraerMembretesDocx(zip: JSZip): Promise<MembretesDocx> {
  const docRels = await leerRelsMapa(zip, 'word/_rels/document.xml.rels')
  const docXml = (await zip.file('word/document.xml')?.async('string')) ?? ''
  const sects = [...docXml.matchAll(/<w:sectPr[\s>][\s\S]*?<\/w:sectPr>/g)].map((m) => m[0])
  const sect = sects[sects.length - 1] ?? ''
  const refId = (el: 'header' | 'footer', tipo: string): string | undefined => {
    const a = sect.match(new RegExp(`<w:${el}Reference\\b[^>]*w:type="${tipo}"[^>]*r:id="(rId\\d+)"`))?.[1]
    if (a) return a
    return sect.match(new RegExp(`<w:${el}Reference\\b[^>]*r:id="(rId\\d+)"[^>]*w:type="${tipo}"`))?.[1]
  }
  const leerParte = async (rId: string | undefined, tipo: string): Promise<ParteMembrete | null> => {
    if (!rId) return null
    const tgt = docRels.get(rId)
    if (!tgt) return null
    const archivo = `word/${tgt}`
    const f = zip.file(archivo)
    if (!f) return null
    const x = await f.async('string')
    const prels = await leerRelsMapa(zip, archivo.replace('word/', 'word/_rels/') + '.rels')
    const imagenes: ParteMembrete['imagenes'] = []
    for (const dm of x.matchAll(/<w:drawing[\s>][\s\S]*?<\/w:drawing>/g)) {
      const d = dm[0]
      const emb = d.match(/r:embed="(rId\d+)"/)?.[1]
      if (!emb) continue
      const mt = prels.get(emb)
      if (!mt) continue
      const mf = zip.file(`word/${mt}`)
      if (!mf) continue
      const ext = d.match(/<wp:extent[^>]*cx="(\d+)"[^>]*cy="(\d+)"/)
      imagenes.push({
        bytes: new Uint8Array(await mf.async('uint8array')),
        ext: (mt.split('.').pop() ?? '').toLowerCase(),
        wPt: ext ? parseInt(ext[1]) / 12700 : 0,
        hPt: ext ? parseInt(ext[2]) / 12700 : 0,
      })
    }
    const texto = [...x.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/g)]
      .map((mm) => mm[1]).join(' ').replace(/\s+/g, ' ').trim().slice(0, 160)
    return { tipo, archivo, imagenes, texto }
  }
  const headers: ParteMembrete[] = []
  const footers: ParteMembrete[] = []
  for (const [arr, el, tipo] of [
    [headers, 'header', 'first'], [headers, 'header', 'default'],
    [footers, 'footer', 'first'], [footers, 'footer', 'default'],
  ] as const) {
    const p = await leerParte(refId(el, tipo), tipo)
    if (p) arr.push(p)
  }
  return { headers, footers }
}

interface Run { texto: string; bold: boolean; italic: boolean; size: number; color?: string; imagen?: { id: string; cx: number; cy: number } }
interface Parrafo { runs: Run[]; align: 'left' | 'center' | 'right' | 'both'; espacio: number }

/** Une runs sin espacios fantasma: solo se conserva el blanco que trae el texto. */
export function unirRuns(xml: string): string {
  const paras: string[] = []
  for (const pm of xml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)) {
    let out = ''
    for (const rm of pm[0].matchAll(/<w:r[\s>][\s\S]*?<\/w:r>/g)) {
      const tx = [...rm[0].matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/g)].map((mm) => mm[1]).join('')
      if (!tx) continue
      out += (out && !/\s$/.test(out) && !/^\s/.test(tx)) ? tx : (/^\s/.test(tx) && /\s$/.test(out) ? tx.replace(/^\s+/, '') : tx)
    }
    if (out.trim()) paras.push(out.replace(/[ \t]+/g, ' ').trim())
  }
  return paras.join(' ')
}

/** Celda que continúa una fusión vertical (`<w:vMerge/>` sin `restart`): su texto ya vive en la celda inicial. */
export function esContinuacionVMerge(tcXml: string): boolean {
  const m = tcXml.match(/<w:vMerge\b([^>]*)\/>/)
  if (!m) return false
  return !/w:val="restart"/.test(m[1])
}

/** Reescala el extent del membrete tras recortar aire (conserva proporción). */
export function ajustarExtent(
  wPt: number, hPt: number,
  fx0: number, fx1: number, fy0: number, fy1: number,
): { wPt: number; hPt: number } {
  return { wPt: wPt > 0 ? wPt * (fx1 - fx0) : 0, hPt: hPt > 0 ? hPt * (fy1 - fy0) : 0 }
}

/** Detecta párrafos residuales cortos sin dígitos ni puntuación final. */
export function esRuido(txt: string): boolean {
  const t = txt.trim()
  if (!t || /\d/.test(t)) return false
  const words = t.split(/\s+/)
  if (words.length > 3) return false
  if (/[.:;!?…]$/.test(t)) return false
  return words.every((w) => w.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ]/g, '').length <= 2)
}

const EMU = 12700

export async function renderDocxInstrumentacion(
  doc: PDFDocument,
  t: Tema,
  originalBase64: string,
  onProgreso?: (m: string) => void,
): Promise<number> {
  const zip = await JSZip.loadAsync(base64ABytes(originalBase64))
  const docXml = await zip.file('word/document.xml')?.async('string') ?? ''
  onProgreso?.('Leyendo estructura del .docx…')

  // Página y márgenes reales
  const pgSz = docXml.match(/<w:pgSz[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"/)
  const pgMar = docXml.match(/<w:pgMar[^>]*w:top="(\d+)"[^>]*w:right="(\d+)"[^>]*w:bottom="(\d+)"[^>]*w:left="(\d+)"/)
  const PW = pgSz ? parseInt(pgSz[1]) / 20 : 792
  const PH = pgSz ? parseInt(pgSz[2]) / 20 : 612
  const mT = pgMar ? parseInt(pgMar[1]) / 20 : 60
  const mR = pgMar ? parseInt(pgMar[2]) / 20 : 60
  const mB = pgMar ? parseInt(pgMar[3]) / 20 : 60
  const mL = pgMar ? parseInt(pgMar[4]) / 20 : 60
  const CW = PW - mL - mR

  // ---------- Media del cuerpo (rels del documento) ----------
  const docRels = await leerRelsMapa(zip, 'word/_rels/document.xml.rels')
  const mediaCache = new Map<string, { img: PDFImage | null; bytes: number }>()
  const embedBytes = async (bytes: Uint8Array, ext: string): Promise<PDFImage | null> => {
    const livianos = await limitarPeso(bytes, ext)
    const key = `${livianos.ext}:${livianos.bytes.length}:${livianos.bytes[0] ?? 0}`
    if (mediaCache.has(key)) return mediaCache.get(key)!.img
    const b = livianos.bytes
    const e = livianos.ext
    let img: PDFImage | null = null
    try { img = e === 'png' ? await doc.embedPng(b) : await doc.embedJpg(b) }
    catch { try { img = e === 'png' ? await doc.embedJpg(b) : await doc.embedPng(b) } catch { img = null } }
    mediaCache.set(key, { img, bytes: b.length })
    return img
  }
  const embedMedia = async (id: string): Promise<PDFImage | null> => {
    const tgt = docRels.get(id)
    if (!tgt || !tgt.startsWith('media/')) return null
    const f = zip.file(`word/${tgt}`)
    if (!f) return null
    return embedBytes(new Uint8Array(await f.async('uint8array')), (tgt.split('.').pop() ?? '').toLowerCase())
  }

  // ---------- Membretes propios del documento (first/default, rels propios) ----------
  const mem = await extraerMembretesDocx(zip)
  const memImgs = new Map<string, { img: PDFImage | null; wPt: number; hPt: number }>()
  const memImg = async (parte: ParteMembrete | null, i: number) => {
    if (!parte || !parte.imagenes[i]) return null
    const k = `${parte.archivo}#${i}`
    if (!memImgs.has(k)) {
      const m = parte.imagenes[i]
      const rec = await recortarBordes(m.bytes)
      const ext = ajustarExtent(m.wPt, m.hPt, rec.fx0, rec.fx1, rec.fy0, rec.fy1)
      memImgs.set(k, { img: await embedBytes(rec.bytes, m.ext), wPt: ext.wPt, hPt: ext.hPt })
    }
    return memImgs.get(k)!
  }
  // Reserva: banner del tema si el .docx no trae membrete.
  const headElegido = async (primera: boolean) => {
    const parte = (primera ? mem.headers.find((h) => h.tipo === 'first') : null)
      ?? mem.headers.find((h) => h.tipo === 'default') ?? mem.headers[0] ?? null
    const imgs: { img: PDFImage | null; wPt: number; hPt: number }[] = []
    if (parte) for (let i = 0; i < Math.min(2, parte.imagenes.length); i++) {
      const r = await memImg(parte, i)
      if (r) imgs.push(r)
    }
    if (!imgs.length && t.headerImg) imgs.push({ img: t.headerImg, wPt: 0, hPt: 0 })
    return { imgs, texto: parte?.texto ?? '' }
  }
  const footElegido = async (primera: boolean) => {
    const parte = (primera ? mem.footers.find((h) => h.tipo === 'first') : null)
      ?? mem.footers.find((h) => h.tipo === 'default') ?? mem.footers[0] ?? null
    const imgs: { img: PDFImage | null; wPt: number; hPt: number }[] = []
    if (parte) for (let i = 0; i < Math.min(2, parte.imagenes.length); i++) {
      const r = await memImg(parte, i)
      if (r) imgs.push(r)
    }
    if (!imgs.length && t.footerImg) imgs.push({ img: t.footerImg, wPt: 0, hPt: 0 })
    return { imgs, texto: parte?.texto ?? '' }
  }
  const head1 = await headElegido(true)
  const headN = await headElegido(false)
  const foot1 = await footElegido(true)
  const footN = await footElegido(false)

  let page: PDFPage | null = null
  let y = 0
  let paginas = 0
  let topeContenido = 0 // Y útil al abrir la página

  /** Membretes en la zona de margen; el contenido ocupa [mB, PH-mT]. */
  const dibujarCabeza = (imgs: { img: PDFImage | null; wPt: number; hPt: number }[], texto: string) => {
    const maxW = Math.min(CW, PW - 40)
    const zona = Math.max(24, mT - 8)
    const piezas = imgs.filter((m) => m.img).map((m) => {
      const w = Math.min(m.wPt > 0 ? m.wPt : m.img!.width * 0.75, maxW)
      return { img: m.img!, w, h: m.hPt > 0 ? m.hPt : (w * m.img!.height) / m.img!.width }
    })
    const altoTxt = texto ? 13.5 : 0
    const total = piezas.reduce((s, p) => s + p.h + 2, 0) + altoTxt
    const e = total > zona && total > 0 ? zona / total : 1
    let yy = PH - 4
    for (const p of piezas) {
      const w = p.w * e
      const h = p.h * e
      page!.drawImage(p.img, { x: (PW - w) / 2, y: yy - h, width: w, height: h })
      yy -= h + 2 * e
    }
    if (texto) {
      const s = 7.5 * e
      const str = sanearWinAnsi(texto).slice(0, 110)
      const w = t.helvB.widthOfTextAtSize(str, s)
      page!.drawText(str, { x: (PW - w) / 2, y: yy - s, size: s, font: t.helvB })
    }
  }

  const dibujarPie = (imgs: { img: PDFImage | null; wPt: number; hPt: number }[], texto: string) => {
    const maxW = Math.min(CW, PW - 80)
    const zona = Math.max(20, mB - 4)
    const piezas = imgs.filter((m) => m.img).map((m) => {
      const w = Math.min(m.wPt > 0 ? m.wPt : m.img!.width * 0.75, maxW)
      return { img: m.img!, w, h: m.hPt > 0 ? m.hPt : (w * m.img!.height) / m.img!.width }
    })
    const altoTxt = texto ? 12 : 0
    const total = piezas.reduce((s, p) => s + p.h + 2, 0) + altoTxt
    const e = total > zona && total > 0 ? zona / total : 1
    let yf = 3
    if (texto) {
      const s = 6.5 * e
      const str = sanearWinAnsi(texto).slice(0, 130)
      const w = t.helv.widthOfTextAtSize(str, s)
      page!.drawText(str, { x: (PW - w) / 2, y: yf + 2, size: s, font: t.helv, color: rgb(0.4, 0.4, 0.4) })
      yf += 12 * e
    }
    for (const p of piezas) {
      const w = p.w * e
      const h = p.h * e
      page!.drawImage(p.img, { x: (PW - w) / 2, y: yf, width: w, height: h })
      yf += h + 2 * e
    }
  }

  const nueva = () => {
    page = doc.addPage([PW, PH])
    paginas++
    const primera = paginas === 1
    dibujarCabeza((primera ? head1 : headN).imgs, (primera ? head1 : headN).texto)
    dibujarPie((primera ? foot1 : footN).imgs, (primera ? foot1 : footN).texto)
    y = PH - mT
    topeContenido = y
    return mB + 2 // límite inferior del contenido
  }
  let limite = nueva()
  let vaciasSeguidas = 0
  const asegurar = (h: number) => { if (y - h < limite + 4) limite = nueva() }

  // Bloques en orden
  const body = docXml.match(/<w:body[\s>][\s\S]*<\/w:body>/)?.[0] ?? docXml
  const bloques = [...body.matchAll(/<w:tbl[\s>][\s\S]*?<\/w:tbl>|<w:p[\s>][\s\S]*?<\/w:p>/g)].map((m) => m[0])
  onProgreso?.(`Renderizando ${bloques.length} bloques…`)

  for (const b of bloques) {
    if (!page) limite = nueva()
    if (b.startsWith('<w:tbl')) {
      const grid = [...b.matchAll(/<w:gridCol[^>]*w:w="(\d+)"/g)].map((m) => parseInt(m[1]) / 20)
      const total = grid.reduce((s, v) => s + v, 0) || 1
      const esc = CW / total
      const rows = [...b.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)].map((m) => m[0])
      const size = 8.5
      rows.forEach((r, ri) => {
        const cells = [...r.matchAll(/<w:tc[\s>][\s\S]*?<\/w:tc>/g)].map((m) => m[0])
        let col = 0
        const dib: { x: number; w: number; lineas: string[]; fondo?: ReturnType<typeof rgb> }[] = []
        for (const c of cells) {
          const span = parseInt(c.match(/gridSpan[^>]*w:val="(\d+)"/)?.[1] ?? '1')
          let w = 0
          for (let k = 0; k < span && col + k < grid.length; k++) w += grid[col + k] * esc
          col += span
          // Fusión vertical: la celda continuada se dibuja vacía.
          const txt = esContinuacionVMerge(c) ? '' : unirRuns(c)
          const fill = c.match(/w:fill="([0-9A-Fa-f]{6})"/)?.[1]
          const lineas = wrapTexto(txt || '', ri === 0, size, Math.max(20, w - 8))
          dib.push({
            x: 0, w, lineas,
            fondo: fill ? rgb(parseInt(fill.slice(0, 2), 16) / 255, parseInt(fill.slice(2, 4), 16) / 255, parseInt(fill.slice(4, 6), 16) / 255) : ri === 0 ? rgb(0.93, 0.94, 0.96) : undefined,
          })
        }
        let x = mL
        for (const d of dib) { d.x = x; x += d.w }
        // Ninguna tabla excede el ancho del contenido.
        const totalW = dib.reduce((s, d) => s + d.w, 0)
        if (totalW > CW + 0.5) {
          const f = CW / totalW
          let xx = mL
          for (const d of dib) {
            d.w *= f
            d.x = xx
            xx += d.w
            d.lineas = wrapTexto(d.lineas.join(' '), ri === 0, size, Math.max(20, d.w - 8))
          }
        }
        const altoFila = (lineasMax: number) => Math.max(14, lineasMax * (size + 2.4) + 6)
        // Las filas altas se parten por rebanadas con salto de página.
        let j0 = 0
        const maxLineas = Math.max(...dib.map((d) => d.lineas.length))
        while (j0 < maxLineas) {
          const disp = y - limite
          const caben = Math.max(1, Math.floor((disp - 8) / (size + 2.4)))
          const j1 = Math.min(maxLineas, j0 + caben)
          const alto = altoFila(j1 - j0)
          if (y - alto < limite - 1) { limite = nueva(); continue }
          const yTop = y
          for (const d of dib) {
            page!.drawRectangle({ x: d.x, y: yTop - alto, width: d.w, height: alto, borderColor: rgb(0, 0, 0), borderWidth: 0.6, color: d.fondo })
            d.lineas.slice(j0, j1).forEach((ln, j) => {
              page!.drawText(ln, { x: d.x + 4, y: yTop - size - 3.5 - j * (size + 2.4), size, font: ri === 0 ? t.helvB : t.helv })
            })
          }
          y = yTop - alto
          j0 = j1
          if (j0 < maxLineas) limite = nueva()
        }
      })
      y -= 4
    } else {
      const p = parseParrafo(b)
      const textoPlano = p.runs.filter((r) => !r.imagen).map((r) => r.texto).join('')
      const tieneImg = p.runs.some((r) => r.imagen)
      if (esRuido(textoPlano) && !tieneImg) continue
      if (!textoPlano.trim() && !tieneImg) {
        if (vaciasSeguidas > 0) continue
        vaciasSeguidas++
        y -= 3
        continue
      }
      vaciasSeguidas = 0
      const tieneTexto = !!textoPlano.trim()
      // imágenes del párrafo
      for (const r of p.runs) {
        if (!r.imagen) continue
        const img = await embedMedia(r.imagen.id)
        if (!img) continue
        let w = r.imagen.cx / EMU
        let h = r.imagen.cy / EMU
        if (w > CW) { h = (h * CW) / w; w = CW }
        asegurar(h + 6)
        const x = p.align === 'center' ? mL + (CW - w) / 2 : mL
        page!.drawImage(img, { x, y: y - h, width: w, height: h })
        y -= h + 6
      }
      if (tieneTexto) {
        // medir líneas
        const size = Math.min(16, Math.max(7.5, p.runs[0]?.size ?? 9))
        const lh = size * 1.3
        const lineas: { runs: { texto: string; bold: boolean; italic: boolean; color?: string }[] }[] = []
        const palabras: { w: string; b: boolean; i: boolean; c?: string }[] = []
        for (const r of p.runs) {
          if (r.imagen) continue
          for (const w of r.texto.split(/(\s+)/)) {
            if (!w) continue
            if (/^\s+$/.test(w)) { palabras.push({ w: ' ', b: r.bold, i: r.italic, c: r.color }); continue }
            palabras.push({ w, b: r.bold, i: r.italic, c: r.color })
          }
        }
        let acc: { texto: string; bold: boolean; italic: boolean; color?: string }[] = []
        let ax = 0
        let pendienteEspacio = false
        const spW = (b: boolean, i: boolean) => fuente(b, i).widthOfTextAtSize(' ', size)
        for (const pp of palabras) {
          if (pp.w === ' ') { pendienteEspacio = true; continue }
          const fnt = fuente(pp.b, pp.i)
          const ww = fnt.widthOfTextAtSize(pp.w, size)
          const gap = pendienteEspacio && acc.length ? spW(pp.b, pp.i) : 0
          if (acc.length && ax + gap + ww > CW) {
            lineas.push({ runs: acc }); acc = []; ax = 0; pendienteEspacio = false
          } else if (pendienteEspacio && acc.length) {
            acc.push({ texto: ' ', bold: pp.b, italic: pp.i, color: pp.c }); ax += gap
          }
          pendienteEspacio = false
          // cortar palabras imposibles
          let resto = pp.w
          while (fnt.widthOfTextAtSize(resto, size) > CW) {
            let k = resto.length - 1
            while (k > 1 && fnt.widthOfTextAtSize(resto.slice(0, k), size) > CW) k--
            acc.push({ texto: resto.slice(0, k), bold: pp.b, italic: pp.i, color: pp.c })
            lineas.push({ runs: acc }); acc = []; ax = 0
            resto = resto.slice(k)
          }
          acc.push({ texto: resto, bold: pp.b, italic: pp.i, color: pp.c })
          ax += fnt.widthOfTextAtSize(resto, size)
        }
        if (acc.length) lineas.push({ runs: acc })
        // Control de viudas: un título corto no queda solo al pie de página.
        {
          const conTexto = p.runs.filter((r) => r.texto.trim())
          const esTitulo = lineas.length <= 2 && conTexto.length > 0 &&
            (size >= 12 || conTexto.every((r) => r.bold))
          if (esTitulo && y < topeContenido - lh && y - limite < 4 * lh) limite = nueva()
        }
        for (const ln of lineas) {
          asegurar(lh)
          const total = ln.runs.reduce((s, r) => s + fuente(r.bold, r.italic).widthOfTextAtSize(r.texto, size), 0)
          const x0 = p.align === 'center' ? mL + Math.max(0, (CW - total) / 2) : p.align === 'right' ? mL + CW - total : mL
          let xx = x0
          for (const r of ln.runs) {
            const fnt = fuente(r.bold, r.italic)
            if (r.texto) page!.drawText(r.texto, { x: xx, y: y - size, size, font: fnt, color: r.color ? hexColor(r.color) : undefined })
            xx += fnt.widthOfTextAtSize(r.texto, size)
          }
          y -= lh
        }
        y -= 2
      }
    }
  }

  function fuente(b: boolean, i: boolean) {
    return b ? t.helvB : i ? t.helvI : t.helv
  }

  function hexColor(hex: string) {
    const n = parseInt(hex, 16)
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
  }

  function wrapTexto(texto: string, bold: boolean, size: number, maxW: number): string[] {
    const font = bold ? t.helvB : t.helv
    const out: string[] = []
    let cur = ''
    for (const w of sanearWinAnsi(texto).split(/\s+/).filter(Boolean)) {
      const cand = cur ? cur + ' ' + w : w
      if (font.widthOfTextAtSize(cand, size) > maxW && cur) { out.push(cur); cur = w }
      else cur = cand
    }
    if (cur) out.push(cur)
    return out.length ? out : ['']
  }

  return paginas

  function parseParrafo(xml: string): Parrafo {
    const jc = xml.match(/<w:jc[^>]*w:val="([^"]+)"/)?.[1] ?? 'left'
    const align = jc === 'center' ? 'center' : jc === 'right' ? 'right' : jc === 'both' ? 'both' : 'left'
    const pSize = xml.match(/<w:pPr>[\s\S]*?<w:sz[^>]*w:val="(\d+)"/)?.[1]
    const runs: Run[] = []
    for (const rm of xml.matchAll(/<w:r[\s>][\s\S]*?<\/w:r>/g)) {
      const r = rm[0]
      const bold = /<w:b[\s/>]/.test(r)
      const italic = /<w:i[\s/>]/.test(r)
      const sz = r.match(/<w:sz[^>]*w:val="(\d+)"/)?.[1] ?? pSize ?? '18'
      const size = parseInt(sz) / 2
      const colHex = r.match(/<w:color[^>]*w:val="([0-9A-Fa-f]{6})"/)?.[1]
      const color = colHex && !/^ffffff$/i.test(colHex) ? colHex : undefined
      const dib = r.match(/<w:drawing[\s\S]*?r:embed="(rId\d+)"[\s\S]*?<wp:extent[^>]*cx="(\d+)"[^>]*cy="(\d+)"/)
      if (dib) {
        runs.push({ texto: '', bold, italic, size, imagen: { id: dib[1], cx: parseInt(dib[2]), cy: parseInt(dib[3]) } })
        continue
      }
      let texto = [...r.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/g)].map((mm) => mm[1]).join('')
      texto = texto.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      if (/<w:tab[\s/>]/.test(r)) texto += '    '
      texto = sanearWinAnsi(texto)
      if (texto) runs.push({ texto, bold, italic, size, color })
    }
    return { runs, align, espacio: 2 }
  }
}
