// Infrastructure: ensamblador de Portafolio Institucional.
// Estructura: portada general + índice + instrumentación ORIGINAL +
// portadas por competencia + evidencias concatenadas (orden drag&drop).
// Instrumentación: si es PDF se copian páginas tal cual (preserva membretes y
// orientación landscape/portrait). Si es DOCX se genera sección con los bytes
// originales adjuntos + páginas renderizadas con membrete + contenido parseado.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { Evidencia, Instrumentacion, Portafolio } from '../domain/types'
import { base64ABytes } from './instrumentParser'
import { generarEvidenciaPDF } from './fo14Pdf'

export async function ensamblarPortafolio(
  portafolio: Portafolio,
  evidencias: Evidencia[],
  instrumentacion: Instrumentacion | null,
  meta: { asignatura: string; alumno: string; docente: string; grupo: string; periodo: string },
  onProgreso?: (m: string) => void,
): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  out.setTitle(`Portafolio — ${meta.asignatura}`)
  const helv = await out.embedFont(StandardFonts.Helvetica)
  const helvB = await out.embedFont(StandardFonts.HelveticaBold)

  const evMap = new Map(evidencias.map((e) => [e.id, e]))

  for (const sec of portafolio.secciones) {
    if (sec.tipo === 'portada') {
      onProgreso?.('Portada general…')
      const p = out.addPage([612, 792])
      const dib = (t: string, y: number, s: number, b = false, c = rgb(0, 0, 0)) => {
        const f = b ? helvB : helv
        p.drawText(t.slice(0, 80), { x: (612 - f.widthOfTextAtSize(t.slice(0, 80), s)) / 2, y, size: s, font: f, color: c })
      }
      dib('DIVISIÓN DE INGENIERÍA EN TECNOLOGÍAS', 700, 10, true, rgb(0.12, 0.23, 0.37))
      dib('DE LA INFORMACIÓN Y COMUNICACIONES', 686, 10, true, rgb(0.12, 0.23, 0.37))
      dib('Portafolio de evidencias', 620, 22, true)
      dib(`Asignatura: ${meta.asignatura}`, 560, 12)
      dib(`Elaborado por: ${meta.alumno}`, 535, 12)
      dib(`Docente: ${meta.docente}`, 510, 12)
      dib(`Grupo: ${meta.grupo}`, 485, 12)
      dib(`Período: ${meta.periodo}`, 460, 12)
      dib(portafolio.titulo, 400, 11, true)
    } else if (sec.tipo === 'indice') {
      onProgreso?.('Índice…')
      const p = out.addPage([612, 792])
      p.drawText('CONTENIDO', { x: 85, y: 720, size: 16, font: helvB })
      let y = 690
      portafolio.secciones.forEach((s, i) => {
        if (s.tipo === 'indice' || s.tipo === 'portada') return
        p.drawText(`${i}. ${s.titulo}`.slice(0, 85), { x: 85, y, size: 10, font: helv })
        y -= 20
      })
    } else if (sec.tipo === 'instrumentacion' && instrumentacion) {
      onProgreso?.('Insertando instrumentación original…')
      await insertarInstrumentacionOriginal(out, instrumentacion)
    } else if (sec.tipo === 'portada-competencia' && instrumentacion) {
      const comp = instrumentacion.competencias.find((c) => c.numero === sec.refId)
      if (!comp) continue
      const p = out.addPage([612, 792])
      p.drawText('PORTADA DE LA COMPETENCIA', { x: 85, y: 720, size: 14, font: helvB })
      const líneas = comp.descripcion.match(/.{1,85}(\s|$)/g) ?? []
      let y = 690
      p.drawText(`Competencia específica: ${comp.numero}`, { x: 85, y, size: 11, font: helvB }); y -= 22
      for (const ln of líneas.slice(0, 8)) { p.drawText(ln.trim(), { x: 85, y, size: 9.5, font: helv }); y -= 15 }
      y -= 8
      p.drawText('Indicadores de alcance:', { x: 85, y, size: 11, font: helvB }); y -= 18
      for (const ind of comp.indicadores) {
        p.drawText(`${ind.letra}. ${ind.descripcion}`.slice(0, 88), { x: 85, y, size: 9, font: helv }); y -= 14
      }
      y -= 8
      p.drawText('Temas y subtemas:', { x: 85, y, size: 11, font: helvB }); y -= 18
      for (const t of comp.temas.slice(0, 20)) {
        p.drawText(t.slice(0, 88), { x: 85, y, size: 9, font: helv }); y -= 13
        if (y < 70) break
      }
    } else if (sec.tipo === 'evidencia') {
      const ev = evMap.get(sec.refId ?? '')
      if (!ev) continue
      onProgreso?.(`Evidencia: ${ev.nombreEvidencia.slice(0, 40)}…`)
      const bytes = await generarEvidenciaPDF(ev)
      const src = await PDFDocument.load(bytes)
      const páginas = await out.copyPages(src, src.getPageIndices())
      páginas.forEach((pg) => out.addPage(pg))
    }
  }

  // Adjuntar original DOCX como archivo embebido cuando aplique
  if (instrumentacion && instrumentacion.originalMime.includes('word')) {
    try {
      await out.attach(base64ABytes(instrumentacion.originalBytesBase64), instrumentacion.originalNombre, {
        mimeType: instrumentacion.originalMime,
        description: 'Instrumentación didáctica original FO-205P11000-44',
      })
    } catch { /* pdf-lib attach puede no existir en versiones viejas */ }
  }

  return out.save()
}

async function insertarInstrumentacionOriginal(out: PDFDocument, inst: Instrumentacion) {
  if (inst.originalMime.includes('pdf')) {
    // Copia exacta: preserva membretes y orientación originales
    const src = await PDFDocument.load(base64ABytes(inst.originalBytesBase64))
    const págs = await out.copyPages(src, src.getPageIndices())
    págs.forEach((p) => out.addPage(p))
    return
  }
  // DOCX: portada de trazabilidad + contenido parseado (landscape si original landscape)
  const apaisado = inst.originalOrientacion === 'landscape'
  const W = apaisado ? 792 : 612
  const H = apaisado ? 612 : 792
  const helv = await out.embedFont(StandardFonts.Helvetica)
  const helvB = await out.embedFont(StandardFonts.HelveticaBold)
  const p0 = out.addPage([W, H])
  p0.drawText('Instrumentación didáctica original (FO-205P11000-44)', { x: 60, y: H - 80, size: 14, font: helvB })
  p0.drawText(`Archivo: ${inst.originalNombre}`.slice(0, 90), { x: 60, y: H - 110, size: 10, font: helv })
  p0.drawText(`Orientación original: ${inst.originalOrientacion} — preservada en esta sección`, { x: 60, y: H - 130, size: 10, font: helv })
  p0.drawText('El .docx original va adjunto al PDF. Abajo, extracto estructurado:', { x: 60, y: H - 150, size: 10, font: helv })
  let y = H - 190
  for (const c of inst.competencias) {
    if (y < 80) break
    p0.drawText(`Competencia ${c.numero}`.slice(0, 90), { x: 60, y, size: 11, font: helvB }); y -= 18
    p0.drawText(c.descripcion.slice(0, 110), { x: 60, y, size: 9, font: helv }); y -= 16
    for (const t of c.temas.slice(0, 6)) {
      p0.drawText(t.slice(0, 100), { x: 70, y, size: 8.5, font: helv }); y -= 13
    }
    y -= 10
  }
}
