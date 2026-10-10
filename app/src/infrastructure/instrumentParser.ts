// Infrastructure: parser inteligente de instrumentaciones FO-205P11000-44.
// Tolera formatos docentes inconsistentes: múltiples variantes de etiquetas,
// tablas anidadas, saltos de línea, mayúsculas/minúsculas, .docx y .pdf.
// Estrategia: mammoth (texto crudo + HTML) + JSZip (document.xml para tablas,
// pgSz para orientación, header/footer) + pdfjs para PDFs.
// Siempre conserva bytes originales + orientación para incrustar en portafolio.
// Devuelve necesitaRevision=true cuando la confianza es baja.

import mammoth from 'mammoth'
import JSZip from 'jszip'
import type { Competencia, IndicadorAlcance, Instrumentacion } from '../domain/types'
import { uid } from '../domain/types'

export interface ParseResult {
  instrumentacion: Instrumentacion
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function parsearInstrumentacion(
  file: File,
  onProgreso?: (msg: string) => void,
): Promise<ParseResult> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const b64 = base64De(buf)
  const esPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')

  if (esPdf) {
    onProgreso?.('Leyendo PDF…')
    await sleep(30)
    return parsearPdf(buf, b64, file)
  }
  onProgreso?.('Extrayendo texto del .docx…')
  await sleep(30)
  return parsearDocx(buf, b64, file, onProgreso)
}

// ---------- DOCX ----------
async function parsearDocx(buf: Uint8Array, b64: string, file: File, prog?: (m: string) => void) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  const paraMammoth = { arrayBuffer: ab.slice(0), buffer: new Uint8Array(ab.slice(0)) } as never
  const [{ value: html }, { value: rawText }] = await Promise.all([
    mammoth.convertToHtml(paraMammoth),
    mammoth.extractRawText({ arrayBuffer: ab.slice(0), buffer: new Uint8Array(ab.slice(0)) } as never),
  ])
  prog?.('Analizando tablas y competencias…')
  await sleep(30)

  const zip = await JSZip.loadAsync(buf)
  const docXml = await zip.file('word/document.xml')?.async('string') ?? ''
  const orientacion = detectarOrientacion(docXml)

  const meta = extraerMeta(rawText)
  const competencias = extraerCompetencias(rawText, docXml, html)

  const confianza = calcularConfianza(meta, competencias, rawText)
  const inst: Instrumentacion = {
    id: uid(),
    asignatura: meta.asignatura || sinExtension(file.name),
    docente: meta.docente || '',
    grupo: meta.grupo || '',
    periodo: meta.periodo || '',
    division: meta.division || '',
    planEstudios: meta.plan,
    clave: meta.clave,
    competencias,
    originalNombre: file.name,
    originalMime: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    originalBytesBase64: b64,
    originalOrientacion: orientacion,
    necesitaRevision: confianza < 0.75 || competencias.length === 0,
    parseConfianza: confianza,
    creadaEn: Date.now(),
  }
  return { instrumentacion: inst }
}

// ---------- PDF ----------
async function parsearPdf(buf: Uint8Array, b64: string, file: File) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const pdf = await pdfjs.getDocument({ data: buf.slice() }).promise
  let texto = ''
  let landscape = 0
  for (let p = 1; p <= Math.min(pdf.numPages, 60); p++) {
    const page = await pdf.getPage(p)
    const vp = page.getViewport({ scale: 1 })
    if (vp.width > vp.height) landscape++
    const tc = await page.getTextContent()
    texto += tc.items.map((it: unknown) => (it as { str?: string }).str ?? '').join(' ') + '\n'
  }
  const orientacion = landscape > pdf.numPages / 2 ? 'landscape' : 'portrait'
  const meta = extraerMeta(texto)
  const competencias = extraerCompetencias(texto, '', '')
  const confianza = calcularConfianza(meta, competencias, texto)
  const inst: Instrumentacion = {
    id: uid(),
    asignatura: meta.asignatura || sinExtension(file.name),
    docente: meta.docente || '',
    grupo: meta.grupo || '',
    periodo: meta.periodo || '',
    division: meta.division || '',
    competencias,
    originalNombre: file.name,
    originalMime: 'application/pdf',
    originalBytesBase64: b64,
    originalOrientacion: orientacion,
    necesitaRevision: confianza < 0.75 || competencias.length === 0,
    parseConfianza: confianza,
    creadaEn: Date.now(),
  }
  return { instrumentacion: inst }
}

// ---------- Extracción tolerante ----------
function extraerMeta(t: string) {
  const linea = (re: RegExp) => {
    const m = t.match(re)
    return m?.[1]?.trim().replace(/\s+/g, ' ') ?? ''
  }
  return {
    division: linea(/divisi[oó]n\s*:?\s*(.+?)(?:\n|docente|asignatura|plan|clave|fecha|per[ií]odo|grupo)/is),
    docente: linea(/docente\s*:?\s*(?:\(\d+\)\s*)?(.+?)(?:\n|asignatura|plan|clave|fecha)/is),
    asignatura: linea(/asignatura\s*:?\s*(?:\(\d+\)\s*)?(.+?)(?:\n|plan|clave|fecha|per[ií]odo|horas|caracterizaci)/is),
    grupo: linea(/grupo\s*:?\s*(?:\(\d+\)\s*)?([A-Za-z0-9\- ]+?)(?:\n|horas|per[ií]odo|cr[eé]ditos)/is),
    periodo: linea(/per[ií]odo\s*:?\s*(?:\(\d+\)\s*)?(\d{4}\s*-\s*\d)/i),
    plan: linea(/plan de estudios\s*:?\s*(?:\(\d+\)\s*)?(.+?)(?:\n|clave)/is),
    clave: linea(/clave[^\n]*?:?\s*(?:\(\d+\)\s*)?([A-Z0-9\s\-–—]+?)(?:\n|fecha)/i),
  }
}

function extraerCompetencias(raw: string, _xml: string, _html: string): Competencia[] {
  const comps: Competencia[] = []
  // Segmentar por "Competencia No.:" — exigir punto para no partir en "Competencia no alcanzada"
  const partes = raw.split(/competencia\s*no\.\s*:?/i).slice(1)
  if (partes.length === 0) {
    // Fallback: buscar "descripción" + "temas y subtemas"
    const desc = raw.match(/descripci[oó]n\s*\(?\d*\)?\s*:?\s*(.+?)(?:temas|actividades|indicadores)/is)?.[1]?.trim()
    if (desc) comps.push({ numero: '1', descripcion: limpiar(desc), temas: extraerTemas(raw), indicadores: extraerIndicadores(raw), evidenciasSugeridas: extraerEvidencias(raw) })
    return comps
  }
  for (const seg of partes) {
    const numero = seg.match(/^\s*\(?\d*\)?\s*([0-9,\/\-\s]+?)(?:\n|descripci)/)?.[1]?.trim() || String(comps.length + 1)
    const descripcion = seg.match(/descripci[oó]n\s*\(?\d*\)?\s*:?\s*(.+?)(?:temas|actividades|horas|encuadre|desarrollo)/is)?.[1]?.trim() ?? ''
    const temas = extraerTemas(seg)
    const indicadores = extraerIndicadores(seg.length > 200 ? seg : raw)
    const evidencias = extraerEvidencias(seg)
    if (descripcion || temas.length) {
      comps.push({
        numero: numero.replace(/[^\d,\/]/g, '').trim() || String(comps.length + 1),
        descripcion: limpiar(descripcion).slice(0, 1200),
        temas,
        indicadores,
        evidenciasSugeridas: evidencias,
      })
    }
  }
  // Deduplicar por número
  const vistos = new Set<string>()
  return comps.filter((c) => (vistos.has(c.numero) ? false : (vistos.add(c.numero), true)))
}

function extraerTemas(seg: string): string[] {
  // Los temas vienen en filas de tabla DESPUÉS del encabezado
  // "Temas... | Actividades de aprendizaje | ...", así que no cortar en "actividades".
  const m = seg.match(/temas y subtemas[\s\S]{0,200}?([\s\S]+?)(?:indicadores de alcance|matriz de evaluaci|niveles de desempe)/i)
  const bloque = m?.[1] ?? seg
  const lineas = bloque.split('\n').map((l) => l.trim()).filter(Boolean)
  const temas = lineas
    .filter((l) => /^\d+(\.\d+)*[\).\s-]/.test(l) && l.length < 220 && !/^(actividades|horas|encuadre|examen|indicadores|matriz|niveles)/i.test(l))
    .slice(0, 40)
  // Fallback xml: párrafos que parecen numeración
  void m
  return temas.length ? temas : lineas.filter((l) => l.length > 8 && l.length < 160).slice(0, 12)
}

function extraerIndicadores(texto: string): IndicadorAlcance[] {
  const inds: IndicadorAlcance[] = []
  // Buscar solo dentro del bloque de indicadores de alcance (24)
  const bloque = texto.match(/indicadores de alcance\s*\(?24\)?([\s\S]+?)(?:niveles de desempe|matriz|valoraci)/i)?.[1] ?? texto
  const re = /(?:^|\n)\s*([A-Z])\)\s*([^\n]{5,240}?)(?:\s+(\d{1,3}))?\s*(?=\n|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec('\n' + bloque)) !== null) {
    const letra = m[1]
    if (!/^[A-Z]$/.test(letra)) continue
    if (inds.some((i) => i.letra === letra)) continue
    const desc = limpiar(m[2])
    if (desc.length < 5 || /^(valor|competencia|desempe|nivel)/i.test(desc)) continue
    const valor = m[3] ? parseInt(m[3], 10) : null
    inds.push({ letra, descripcion: desc.slice(0, 300), valor: valor !== null && valor <= 100 ? valor : null })
    if (inds.length >= 12) break
  }
  return inds.sort((a, b) => a.letra.localeCompare(b.letra))
}

function extraerEvidencias(seg: string): string[] {
  const m = seg.match(/matriz de evaluaci[\s\S]+?(?:evidencia de aprendizaje[\s\S]+?)([\s\S]{0,2500}?)(?:total|calendarizaci|$)/i)
  if (!m) return []
  return m[1].split('\n').map((l) => l.trim()).filter((l) => l.length > 12 && l.length < 280 && !/^(\d+%|hetero|auto|coev|X|total)/i.test(l)).slice(0, 10)
}

function calcularConfianza(meta: ReturnType<typeof extraerMeta>, comps: Competencia[], raw: string): number {
  let s = 0
  if (meta.asignatura) s += 0.2
  if (meta.docente) s += 0.15
  if (meta.grupo) s += 0.1
  if (meta.periodo) s += 0.1
  if (comps.length > 0) s += 0.25
  if (comps.some((c) => c.indicadores.length >= 3)) s += 0.15
  if (raw.length > 3000) s += 0.05
  return Math.min(1, s)
}

function detectarOrientacion(docXml: string): 'portrait' | 'landscape' {
  const m = docXml.match(/<w:pgSz[^>]*w:orient="landscape"/)
  if (m) return 'landscape'
  const sz = docXml.match(/<w:pgSz[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"/)
  if (sz && parseInt(sz[1], 10) > parseInt(sz[2], 10)) return 'landscape'
  return 'portrait'
}

function limpiar(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/^[:\-–—\s]+/, '').trim()
}
function sinExtension(n: string): string {
  return n.replace(/\.(docx|pdf)$/i, '').replace(/_/g, ' ')
}
function base64De(buf: Uint8Array): string {
  let s = ''
  for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192))
  return btoa(s)
}
export function base64ABytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return u
}
