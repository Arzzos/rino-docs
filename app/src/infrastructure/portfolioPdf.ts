// Ensamblador del portafolio institucional.
// Orden de grupos fijo; dentro de cada grupo manda el orden del usuario.
// Índice con números de página reales, enlaces y esquema del documento.

import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, rgb } from 'pdf-lib'
import type { Diagnostica, Evidencia, Instrumentacion, Portafolio } from '../domain/types'
import { grupoDe } from '../domain/types'
import { base64ABytes } from './instrumentParser'
import { generarEvidenciaPDF, mapaDeIndicadores } from './fo14Pdf'
import { renderDocxInstrumentacion } from './docxFullRender'
import {
  AZUL_TESCI, CARTA_H, CARTA_W, CONTENT_W, GRIS, M_L,
  baseUrl, crearTema, dibujarMembretes, nuevoFlujo, parrafo, sanearWinAnsi, tituloCentrado, wrap,
} from './pdfTheme'

interface EntradaIndice { titulo: string; pagina: number; nivel: number }

export async function ensamblarPortafolio(
  portafolio: Portafolio,
  evidencias: Evidencia[],
  instrumentacion: Instrumentacion | null,
  diagnosticas: Diagnostica[],
  meta: { asignatura: string; division: string; alumno: string; docente: string; grupo: string; periodo: string },
  onProgreso?: (m: string) => void,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(`Portafolio de evidencias — ${meta.asignatura}`)
  doc.setCreator('Rino Docs (offline-first)')
  const t = await crearTema(doc)
  const evMap = new Map(evidencias.map((e) => [e.id, e]))
  const diagMap = new Map(diagnosticas.map((d) => [d.id, d]))
  const entradas: EntradaIndice[] = []

  const secciones = [...portafolio.secciones]
    .map((s) => ({ ...s, grupo: s.grupo ?? grupoDe(s.tipo) }))
  // El orden de salida es fijo por grupos; el orden relativo dentro del grupo se conserva.

  // 1. Portada general
  onProgreso?.('Portada general…')
  try {
    const r = await fetch(`${baseUrl()}membretes/portada.jpg`)
    if (r.ok) {
      const jpg = await doc.embedJpg(new Uint8Array(await r.arrayBuffer()))
      const p = doc.addPage([CARTA_W, CARTA_H])
      p.drawImage(jpg, { x: 0, y: 0, width: CARTA_W, height: CARTA_H })
      const cent = (txt: string, y: number, s: number, bold = true, color = rgb(0.15, 0.15, 0.18)) => {
        const limpio = sanearWinAnsi(txt).slice(0, 80)
        const f = bold ? t.helvB : t.helv
        const w = f.widthOfTextAtSize(limpio, s)
        p.drawText(limpio, { x: (CARTA_W - w) / 2, y, size: s, font: f, color })
      }
      cent(meta.division.toUpperCase().slice(0, 70), 655, 9.5)
      cent('Portafolio de evidencias', 418, 19)
      cent(`Asignatura: ${meta.asignatura}`.slice(0, 75), 382, 10.5, false)
      cent(`Elaborado por: ${meta.alumno}`.slice(0, 75), 360, 10.5, false)
      cent(`Docente: ${meta.docente}`.slice(0, 75), 338, 10.5, false)
      cent(`Grupo: ${meta.grupo}`, 316, 10.5, false)
      cent(`Período: ${meta.periodo}`, 294, 10.5, false)
    } else {
      portadaTexto()
    }
  } catch { portadaTexto() }

  function portadaTexto() {
    const f = nuevoFlujo(t, true)
    tituloCentrado(f, meta.division.toUpperCase().slice(0, 70), 10, true, AZUL_TESCI)
    f.y -= 60
    tituloCentrado(f, 'Portafolio de evidencias', 22, true)
    f.y -= 10
    for (const ln of [`Asignatura: ${meta.asignatura}`, `Elaborado por: ${meta.alumno}`, `Docente: ${meta.docente}`, `Grupo: ${meta.grupo}`, `Período: ${meta.periodo}`]) {
      tituloCentrado(f, ln.slice(0, 75), 11, false)
    }
  }

  const numPag = () => doc.getPageCount()

  // 2. Cuerpo por grupos
  const porGrupo = (g: string) => secciones.filter((s) => (s.grupo ?? grupoDe(s.tipo)) === g)

  // 2a. Instrumentación (PDF copiado o DOCX convertido).
  for (const s of porGrupo('instrumentacion')) {
    void s
    if (!instrumentacion) continue
    onProgreso?.('Instrumentación original íntegra…')
    const inicio = numPag() + 1
    if (instrumentacion.originalMime.includes('pdf')) {
      const src = await PDFDocument.load(base64ABytes(instrumentacion.originalBytesBase64))
      const pgs = await doc.copyPages(src, src.getPageIndices())
      pgs.forEach((p) => doc.addPage(p))
    } else if (instrumentacion.pdfBytesBase64) {
      const src = await PDFDocument.load(base64ABytes(instrumentacion.pdfBytesBase64))
      const pgs = await doc.copyPages(src, src.getPageIndices())
      pgs.forEach((p) => doc.addPage(p))
    } else {
      await renderDocxInstrumentacion(doc, t, instrumentacion.originalBytesBase64, onProgreso)
    }
    entradas.push({ titulo: 'Instrumentación didáctica para la formación y desarrollo de competencias profesionales', pagina: inicio, nivel: 0 })
  }

  // 2b. Evaluaciones diagnósticas
  const diags = porGrupo('diagnostica').map((s) => diagMap.get(s.refId ?? '')).filter((d): d is Diagnostica => !!d)
  const diagsTodas = diags.length ? diags : []
  for (const d of diagsTodas) {
    onProgreso?.(`Diagnóstica: ${d.nombreHoja}…`)
    const f = nuevoFlujo(t)
    const inicio = numPag()
    f.page.drawText('Examen diagnóstico', { x: M_L, y: f.y - 12, size: 12, font: t.helvB, color: AZUL_TESCI })
    f.y -= 26
    const { dataUrlToBytes } = await import('./imageOptimizer')
    const { bytes, esPng } = dataUrlToBytes(d.imagenDataUrl)
    let img
    try { img = esPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes) }
    catch { try { img = esPng ? await doc.embedJpg(bytes) : await doc.embedPng(bytes) } catch { continue } }
    const ratio = img.height / img.width
    let w = CONTENT_W
    let h = w * ratio
    const maxH = (f.y - 100) * d.escala
    if (h > maxH) { h = maxH; w = h / ratio }
    f.page.drawImage(img, { x: M_L, y: f.y - h, width: w, height: h })
    f.y -= h + 8
    entradas.push({ titulo: d.nombreHoja || 'Evaluación diagnóstica', pagina: inicio, nivel: 0 })
  }

  // 2c. Contenido: portadas de competencia + evidencias (orden del usuario)
  for (const s of porGrupo('contenido')) {
    if (s.tipo === 'portada-competencia' && instrumentacion) {
      const comp = instrumentacion.competencias.find((c) => c.numero === s.refId)
      if (!comp) continue
      onProgreso?.(`Portada competencia ${comp.numero}…`)
      const f = nuevoFlujo(t)
      const inicio = numPag()
      tituloCentrado(f, 'PORTADA DE LA COMPETENCIA', 13, true)
      f.y -= 4
      parrafo(f, `Competencia específica: ${comp.numero}. ${comp.descripcion}`, { size: 10.5 })
      f.y -= 6
      f.page.drawText('Indicadores de alcance:', { x: M_L, y: f.y - 10, size: 10.5, font: t.helvB })
      f.y -= 16
      for (const ind of comp.indicadores) parrafo(f, `${ind.letra}. ${ind.descripcion}`, { size: 9.5 })
      f.y -= 6
      f.page.drawText('Temas y subtemas:', { x: M_L, y: f.y - 10, size: 10.5, font: t.helvB })
      f.y -= 16
      for (const tm of comp.temas) parrafo(f, tm, { size: 9.5 })
      entradas.push({ titulo: `Portada Competencia específica ${comp.numero}.`, pagina: inicio, nivel: 0 })
    } else if (s.tipo === 'evidencia') {
      const ev = evMap.get(s.refId ?? '')
      if (!ev) continue
      onProgreso?.(`Evidencia: ${ev.nombreEvidencia.slice(0, 40)}…`)
      const inicio = numPag() + 1
      // PDF importado: se copia íntegro; editor propio: se genera el FO-14.
      const bytes = ev.origen === 'pdf' && ev.pdfBase64
        ? base64ABytes(ev.pdfBase64)
        : await generarEvidenciaPDF(ev, mapaDeIndicadores(ev, instrumentacion ?? undefined))
      const src = await PDFDocument.load(bytes)
      const pgs = await doc.copyPages(src, src.getPageIndices())
      pgs.forEach((p) => doc.addPage(p))
      entradas.push({ titulo: ev.nombreEvidencia || '(sin nombre)', pagina: inicio, nivel: 1, comp: ev.competenciaNo } as EntradaIndice & { comp: string })
    }
  }

  // 3. Índice tras la portada
  const lineasIndice: { texto: string; pagina: number; nivel: number }[] = []
  for (const e of entradas) {
    if (e.nivel === 0 && e.titulo.startsWith('Portada Competencia')) {
      lineasIndice.push({ texto: e.titulo, pagina: e.pagina, nivel: 0 })
    } else if (e.nivel === 1) {
      lineasIndice.push({ texto: e.titulo, pagina: e.pagina, nivel: 1 })
    } else {
      lineasIndice.push({ texto: e.titulo, pagina: e.pagina, nivel: 0 })
    }
  }
  // Numera evidencias por competencia.
  const contadores = new Map<string, number>()
  let ultimaComp = ''
  for (const ln of lineasIndice) {
    if (ln.nivel === 0 && ln.texto.startsWith('Portada Competencia')) { ultimaComp = ln.texto; continue }
    if (ln.nivel === 1) {
      const k = (contadores.get(ultimaComp) ?? 0) + 1
      contadores.set(ultimaComp, k)
      ln.texto = `${k}. ${ln.texto}`
    }
  }

  // Calcula las páginas del índice.
  const size = 10
  const porPagina = 34
  const nIdx = Math.max(1, Math.ceil((lineasIndice.length + 2) / porPagina))
  // Inserta las páginas del índice tras la portada.
  const idxPages: { page: ReturnType<PDFDocument['getPage']>; y: number }[] = []
  for (let k = 0; k < nIdx; k++) {
    const pg = doc.insertPage(1 + k, [CARTA_W, CARTA_H])
    idxPages.push({ page: pg, y: CARTA_H - 66 - 58 - 4 })
  }
  // Membretes en las páginas del índice.
  for (const { page } of idxPages) {
    dibujarMembretes(t, page)
  }
  // El cuerpo se desplazó +nIdx.
  for (const e of entradas) e.pagina += nIdx
  for (const ln of lineasIndice) ln.pagina += nIdx

  // Dibuja el índice y sus enlaces.
  {
    const pg0 = idxPages[0]
    pg0.page.drawText('CONTENIDO', { x: M_L, y: pg0.y - 12, size: 14, font: t.helvB })
    let yy = pg0.y - 34
    let pi = 0
    const links: { page: ReturnType<PDFDocument['getPage']>; x0: number; y0: number; x1: number; y1: number; dest: number }[] = []
    for (const ln of lineasIndice) {
      if (yy < 110) { pi++; yy = idxPages[pi].y - 10 }
      const pg = idxPages[pi].page
      const x0 = M_L + ln.nivel * 18
      const numStr = String(ln.pagina)
      const numW = t.helv.widthOfTextAtSize(numStr, size)
      const maxW = CARTA_W - M_L - 62 - numW - 14 - (ln.nivel * 18)
      const txts = wrap(ln.texto, t.helv, size, maxW)
      const fh = txts.length * (size + 3) + 3
      txts.forEach((ln2, j) => {
        pg.drawText(ln2, { x: x0, y: yy - size - j * (size + 3), size, font: t.helv })
      })
      // Punteado entre título y página.
      const lastW = t.helv.widthOfTextAtSize(txts[txts.length - 1], size)
      const dotX0 = x0 + (txts.length > 1 ? 0 : lastW) + 4
      const dotX1 = CARTA_W - 62 - numW - 4
      if (dotX1 > dotX0) {
        const dots = '.'.repeat(Math.max(2, Math.floor((dotX1 - dotX0) / t.helv.widthOfTextAtSize('.', size))))
        pg.drawText(dots.slice(0, 120), { x: dotX0, y: yy - size - (txts.length - 1) * (size + 3), size, font: t.helv, color: GRIS })
      }
      pg.drawText(numStr, { x: CARTA_W - 62 - numW, y: yy - size - (txts.length - 1) * (size + 3), size, font: t.helv })
      links.push({ page: pg, x0, y0: yy - fh - 2, x1: CARTA_W - 60, y1: yy + 2, dest: ln.pagina - 1 })
      yy -= fh + 2
    }
    // Anotaciones de enlace.
    for (const l of links) {
      try { agregarLink(doc, l.page, l.x0, l.y0, l.x1, l.y1, l.dest) } catch { /* noop */ }
    }
  }

  // 4. Esquema del documento
  try { construirOutline(doc, entradas.map((e) => ({ titulo: e.titulo.length > 90 ? e.titulo.slice(0, 90) : e.titulo, pagina: e.pagina - 1 }))) } catch { /* noop */ }

  // 5. Adjunta el .docx original.
  if (instrumentacion && instrumentacion.originalMime.includes('word')) {
    try {
      await doc.attach(base64ABytes(instrumentacion.originalBytesBase64), instrumentacion.originalNombre, {
        mimeType: instrumentacion.originalMime,
        description: 'Instrumentación didáctica original FO-205P11000-44',
      })
    } catch { /* versiones viejas de pdf-lib */ }
  }

  return doc.save()
}

function agregarLink(doc: PDFDocument, page: ReturnType<PDFDocument['getPage']>, x0: number, y0: number, x1: number, y1: number, destIdx: number) {
  const ctx = doc.context
  const destPage = doc.getPage(destIdx)
  const annot = ctx.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Link'),
    Rect: [x0, y0, x1, y1],
    Border: [0, 0, 0],
    Dest: [destPage.ref, PDFName.of('Fit')],
  })
  let annots: PDFArray | undefined
  try {
    annots = page.node.lookup(PDFName.of('Annots'), PDFArray)
  } catch {
    annots = undefined
  }
  if (!annots) {
    annots = ctx.obj([]) as unknown as PDFArray
    page.node.set(PDFName.of('Annots'), annots)
  }
  annots.push(annot)
}

function construirOutline(doc: PDFDocument, items: { titulo: string; pagina: number }[]) {
  if (!items.length) return
  const ctx = doc.context
  // Objetos indirectos registrados (evita ciclos Padre/Hijos).
  const outlineRoot = PDFDict.withContext(ctx)
  outlineRoot.set(PDFName.of('Type'), PDFName.of('Outlines'))
  outlineRoot.set(PDFName.of('Count'), PDFNumber.of(items.length))
  const rootRef = ctx.register(outlineRoot)
  let prevRef: ReturnType<typeof ctx.register> | null = null
  let firstRef: ReturnType<typeof ctx.register> | null = null
  let lastRef: ReturnType<typeof ctx.register> | null = null
  for (const it of items) {
    const destPage = doc.getPage(Math.min(it.pagina, doc.getPageCount() - 1))
    const item = PDFDict.withContext(ctx)
    item.set(PDFName.of('Title'), PDFHexString.fromText(it.titulo))
    item.set(PDFName.of('Parent'), rootRef)
    item.set(PDFName.of('Dest'), ctx.obj([destPage.ref, PDFName.of('Fit')]))
    const itemRef = ctx.register(item)
    if (prevRef) {
      const prevDict = ctx.lookup(prevRef, PDFDict)
      prevDict.set(PDFName.of('Next'), itemRef)
      item.set(PDFName.of('Prev'), prevRef)
    } else {
      firstRef = itemRef
    }
    prevRef = itemRef
    lastRef = itemRef
  }
  if (firstRef) outlineRoot.set(PDFName.of('First'), firstRef)
  if (lastRef) outlineRoot.set(PDFName.of('Last'), lastRef)
  doc.catalog.set(PDFName.of('Outlines'), rootRef)
}
