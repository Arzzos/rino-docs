// Lectura de instrumentaciones FO-205P11000-44 (.docx y .pdf).
// Tolera variantes de etiquetas, tablas anidadas y saltos de línea.
// Conserva los bytes originales y la orientación para el portafolio.

import './pdfCompat'
import mammoth from 'mammoth'
import JSZip from 'jszip'
import { crearObreroPdf } from './pdfMotor'
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
    return parsearPdf(buf, b64, file, onProgreso)
  }
  onProgreso?.('Extrayendo texto del .docx…')
  await sleep(30)
  return parsearDocx(buf, b64, file, onProgreso)
}

// DOCX
async function parsearDocx(buf: Uint8Array, b64: string, file: File, prog?: (m: string) => void) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  const paraMammoth = { arrayBuffer: ab.slice(0), buffer: new Uint8Array(ab.slice(0)) } as never
  const { value: rawText } = await mammoth.extractRawText(paraMammoth)
  prog?.('Analizando tablas y competencias…')
  await sleep(30)

  const zip = await JSZip.loadAsync(buf)
  const docXml = await zip.file('word/document.xml')?.async('string') ?? ''
  const orientacion = detectarOrientacion(docXml)

  const meta = extraerMeta(rawText)
  // Las tablas Etiqueta:(N)|valor son más fiables que el regex.
  const metaT = extraerMetaTablas(docXml)
  for (const k of ['division', 'docente', 'asignatura', 'grupo', 'periodo', 'plan', 'clave'] as const) {
    if (metaT[k]) meta[k] = metaT[k] as string
  }
  const { instrumentacion } = construirInstrumentacion({
    texto: rawText, meta, nombre: file.name,
    mime: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    b64, orientacion, filas: filasDeDocx(docXml),
  })
  return { instrumentacion }
}

// PDF
async function parsearPdf(buf: Uint8Array, b64: string, file: File, onProgreso?: (m: string) => void) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // El worker propio aplica el polyfill. Sin Worker (Node/pruebas) pdf.js
  // resuelve su motor local sin necesidad de workerSrc.
  let obrero: Worker | null = null
  if (typeof Worker !== 'undefined') {
    obrero = await crearObreroPdf()
    pdfjs.GlobalWorkerOptions.workerPort = obrero
  }
  let pdf: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']> | null = null
  try {
    pdf = await pdfjs.getDocument({ data: buf.slice() }).promise
    let texto = ''
    let landscape = 0
    const total = Math.min(pdf.numPages, 60)
    const paginas: ItemPdfEstruct[][] = []
    for (let p = 1; p <= total; p++) {
      onProgreso?.(`Leyendo PDF… página ${p}/${pdf.numPages}`)
      const page = await pdf.getPage(p)
      const vp = page.getViewport({ scale: 1 })
      if (vp.width > vp.height) landscape++
      const tc = await page.getTextContent()
      paginas.push(tc.items as ItemPdfEstruct[])
      // Conserva los saltos de línea del PDF (hasEOL).
      texto += textoPdfConLayout(tc.items as { str?: string; hasEOL?: boolean }[]) + '\n'
    }
    texto = normalizarTextoExtraido(texto)
    const orientacion = landscape > pdf.numPages / 2 ? 'landscape' : 'portrait'
    const filas = filasDePdf(paginas)
    const meta = extraerMeta(texto)
    // Las filas posicionales separan etiqueta y valor aunque compartan línea.
    const metaFilas = extraerMetaDeFilas(filas)
    for (const k of ['division', 'docente', 'asignatura', 'grupo', 'periodo', 'plan', 'clave'] as const) {
      if (metaFilas[k]) meta[k] = metaFilas[k] as string
    }
    const { instrumentacion } = construirInstrumentacion({
      texto, meta, nombre: file.name, mime: 'application/pdf', b64, orientacion,
      filas,
    })
    return { instrumentacion }
  } finally {
    if (pdf) await (pdf as unknown as { destroy(): Promise<void> }).destroy().catch(() => undefined)
    if (obrero) {
      pdfjs.GlobalWorkerOptions.workerPort = null
      obrero.terminate()
    }
  }
}

/** Lógica compartida DOCX/PDF para competencias y confianza. */
export function construirInstrumentacion(args: {
  texto: string
  meta: { asignatura: string; docente: string; grupo: string; periodo: string; division: string; plan: string; clave: string }
  nombre: string
  mime: string
  b64: string
  orientacion: 'portrait' | 'landscape'
  filas?: FilaEstruct[]
}): ParseResult {
  const { texto, meta, nombre, mime, b64, orientacion } = args
  let competencias = extraerCompetencias(texto, '', '')
  // La vía estructural por tablas manda cuando produce competencias.
  if (args.filas) {
    const estruct = competenciasDeFilas(args.filas)
    if (estruct.length > 0) competencias = estruct
  }
  const confianza = calcularConfianza(meta, competencias, texto)
  const instrumentacion: Instrumentacion = {
    id: uid(),
    asignatura: meta.asignatura || sinExtension(nombre),
    docente: meta.docente || '',
    grupo: meta.grupo || '',
    periodo: meta.periodo || '',
    division: meta.division || '',
    planEstudios: meta.plan,
    clave: meta.clave,
    competencias,
    originalNombre: nombre,
    originalMime: mime,
    originalBytesBase64: b64,
    originalOrientacion: orientacion,
    necesitaRevision: confianza < 0.75 || competencias.length === 0,
    parseConfianza: confianza,
    creadaEn: Date.now(),
  }
  return { instrumentacion }
}

/**
 * Reconstruye el texto del PDF con saltos de línea (hasEOL) y corte por
 * columnas para que las celdas no se mezclen en el mismo renglón.
 */
const UMBRAL_COLUMNA = 100

export function textoPdfConLayout(items: { str?: string; hasEOL?: boolean; transform?: number[] }[]): string {
  let out = ''
  let xInicio = 0
  let hayTexto = false
  let prev: { str: string; x: number; size: number } | null = null
  for (const it of items) {
    const s = it.str ?? ''
    const x = it.transform?.[4] ?? 0
    const size = it.transform?.[0] ?? 0
    if (!s) {
      if (it.hasEOL) {
        out += '\n'
        hayTexto = false
        prev = null
      }
      continue
    }
    if (hayTexto && x - xInicio > UMBRAL_COLUMNA) {
      out += '\n'
      hayTexto = false
      prev = null
    }
    if (hayTexto && prev) {
      // Une runs partidos a mitad de palabra; conserva el espacio real.
      const hueco = x - prev.x - 0.5 * prev.size
      const partido = prev.str.length === 1 && /^[A-Za-z0-9]$/.test(prev.str) &&
        /^[a-záéíóúñ]/.test(s) && hueco < -3
      out += partido ? '' : ' '
    }
    if (!hayTexto) xInicio = x
    out += s
    hayTexto = true
    prev = { str: s, x, size }
    if (it.hasEOL) {
      out += '\n'
      hayTexto = false
      prev = null
    }
  }
  return out
}

/** Normaliza texto extraído (PDF o DOCX): guiones unicode, espacios, saltos. */
export function normalizarTextoExtraido(t: string): string {
  return sinInvisibles(t)
    .replace(/\r\n?/g, '\n')
    .replace(/[–—−]/g, '-')
    .replace(/[ \t\u00a0]+\n/g, '\n')
    .replace(/[ \t\u00a0]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n'
}

/** Quita el prefijo de número de campo FO `(N)` que el PDF deja en línea. */
function sinNumeroCampo(v: string): string {
  return v.replace(/^\s*\(\d+\)\s*/, '').trim()
}

// Extracción
/** Etiquetas FO-205P11000-44 buscadas en celdas de tabla. */
const META_CAMPOS: { claves: RegExp; campo: 'division' | 'docente' | 'asignatura' | 'grupo' | 'periodo' | 'plan' | 'clave' }[] = [
  { claves: /^divisi[oó]n/i, campo: 'division' },
  { claves: /^docente/i, campo: 'docente' },
  { claves: /^asignatura/i, campo: 'asignatura' },
  { claves: /^grupo/i, campo: 'grupo' },
  { claves: /^per[ií]odo/i, campo: 'periodo' },
  { claves: /^plan de estudios/i, campo: 'plan' },
  { claves: /^clave/i, campo: 'clave' },
]

const normalizarCampo = (campo: string, valor: string): string => {
  const v = valor.replace(/\s+/g, ' ').trim()
  if (!v) return ''
  if (campo === 'periodo') return v.replace(/\s+/g, '')
  if (campo === 'grupo' || campo === 'clave' || campo === 'plan') {
    return v.replace(/[\u2013\u2014\u2212]/g, '-').replace(/\s*-\s*/g, '-').replace(/\s+/g, '')
  }
  return v
}

/** Une los runs de una celda respetando solo los espacios del texto. */
function unirTextosCelda(cellXml: string): string {
  return textoParrafos(cellXml).join(' ')
}

/** Párrafos de una celda: cada uno une sus runs sin espacios fantasma. */
function textoParrafos(cellXml: string): string[] {
  const paras: string[] = []
  for (const pm of cellXml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)) {
    let out = ''
    for (const mm of pm[0].matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/g)) {
      const tx = mm[1]
      if (!tx) continue
      if (out && !/\s$/.test(out) && !/^\s/.test(tx)) out += tx
      else if (/^\s/.test(tx) && /\s$/.test(out)) out += tx.replace(/^\s+/, '')
      else out += tx
    }
    if (out.trim()) paras.push(out.replace(/[ \t]+/g, ' ').trim())
  }
  // Sin párrafos (celda atípica): unir directo.
  if (paras.length === 0) {
    let out = ''
    for (const mm of cellXml.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/g)) {
      const tx = mm[1]
      if (tx) out += tx
    }
    const plano = out.replace(/\s+/g, ' ').trim()
    if (plano) paras.push(plano)
  }
  return paras
}

/** Metadatos desde las tablas del .docx (celda etiqueta → celda vecina). */
export function extraerMetaTablas(docXml: string): Record<string, string> {
  const out: Record<string, string> = {}
  const body = docXml.match(/<w:body[\s>][\s\S]*<\/w:body>/)?.[0] ?? docXml
  for (const tm of body.matchAll(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/g)) {
    for (const rm of tm[0].matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)) {
      const celdas = [...rm[0].matchAll(/<w:tc[\s>][\s\S]*?<\/w:tc>/g)].map((cm) =>
        unirTextosCelda(cm[0]),
      )
      celdas.forEach((txt, i) => {
        const m = txt.match(/^(.+?):\s*\(\d+\)\s*(.*)$/)
        if (!m) return
        const def = META_CAMPOS.find((d) => d.claves.test(m[1].trim()))
        if (!def || out[def.campo]) return
        const valor = m[2].trim() || (celdas[i + 1] ?? '').replace(/^(.+?):\s*\(\d+\)\s*/, '').trim()
        if (/^(.+?):\s*\(\d+\)/.test(celdas[i + 1] ?? '') && !m[2].trim()) return // la vecina es otra etiqueta
        const norm = normalizarCampo(def.campo, valor)
        if (norm) out[def.campo] = norm
      })
    }
    if (out.division && out.docente && out.asignatura && out.grupo && out.periodo) break
  }
  return out
}

/**
 * Metadatos desde los renglones del PDF: la etiqueta y su valor pueden
 * compartir línea con otros pares (`Período: | 2026-2 | Grupo: | 1011-V`).
 * Una celda suelta alineada con el valor anterior continúa el campo
 * (`División:` → `Ingeniería …` → `Comunicaciones`).
 */
export function extraerMetaDeFilas(filas: FilaEstruct[]): Record<string, string> {
  const out: Record<string, string> = {}
  const columnas = new Map<string, { x: number; fila: number }>()
  const continuable = new Set(['division', 'docente', 'asignatura'])
  for (let fi = 0; fi < Math.min(filas.length, 12); fi++) {
    const f = filas[fi]
    const celdas = f.celdas.map(sinInvisibles)
    if (celdas.length === 1) {
      const x = f.xs[0] ?? 0
      let campo: string | null = null
      for (const [c, ancla] of columnas) {
        if (continuable.has(c) && fi - ancla.fila <= 2 && Math.abs(x - ancla.x) <= 3) campo = c
      }
      if (campo && /[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(celdas[0]) && !etiquetaMeta(celdas[0])) {
        out[campo] = `${out[campo] ?? ''} ${celdas[0]}`.replace(/\s+/g, ' ').trim()
        continue
      }
      continue
    }
    for (let i = 0; i < celdas.length; i++) {
      const et = etiquetaMeta(celdas[i])
      if (!et) continue
      let valor = et.resto
      let xValor = f.xs[i] ?? 0
      if (!valor) {
        const sig = celdas[i + 1]?.trim() ?? ''
        if (sig && !etiquetaMeta(sig)) {
          valor = sig
          xValor = f.xs[i + 1] ?? 0
          i++
        }
      }
      const norm = normalizarCampo(et.campo, valor)
      if (!norm || out[et.campo]) continue
      out[et.campo] = norm
      columnas.set(et.campo, { x: xValor, fila: fi })
    }
  }
  return out
}

/** Etiqueta de metadato en una celda; admite el número de campo opcional. */
function etiquetaMeta(celda: string): { campo: string; resto: string } | null {
  const m = celda.trim().match(
    /^(divisi[oó]n|docente|asignatura|grupo|per[ií]odo|plan de estudios|clave(?: de la asignatura)?)\s*:?\s*(?:\(\d+\))?\s*:?\s*(.*)$/i,
  )
  if (!m) return null
  const def = META_CAMPOS.find((d) => d.claves.test(m[1]))
  if (!def) return null
  return { campo: def.campo, resto: m[2].trim() }
}

export function extraerMeta(t: string) {
  // Por líneas: etiqueta y valor pueden ir en renglones distintos.
  const porLinea = t.split('\n').map((l) => l.trim()).filter(Boolean)
  const defs: { re: RegExp; campo: 'division' | 'docente' | 'asignatura' | 'grupo' | 'periodo' | 'plan' | 'clave' }[] = [
    { re: /^divisi[oó]n/i, campo: 'division' },
    { re: /^docente/i, campo: 'docente' },
    { re: /^asignatura/i, campo: 'asignatura' },
    { re: /^grupo/i, campo: 'grupo' },
    { re: /^per[ií]odo/i, campo: 'periodo' },
    { re: /^plan de estudios/i, campo: 'plan' },
    { re: /^clave/i, campo: 'clave' },
  ]
  const esEtiqueta = (l: string) =>
    /^[A-Za-zÁÉÍÓÚáéíóúÑñ() ]{2,45}:?\s*\(\d+\)/.test(l) ||
    defs.some((d) => d.re.test(l) && /:/.test(l)),
  crudo: Record<string, string> = {}
  for (let i = 0; i < porLinea.length; i++) {
    const l = porLinea[i]
    const def = defs.find((d) => d.re.test(l) && /:/.test(l))
    if (!def || crudo[def.campo]) continue
    // Valor en la misma línea (tras `:` y el `(N)` opcional).
    let valor = sinNumeroCampo(l.replace(/^[^:]*:/, '').trim())
    // Continúa en renglones siguientes hasta la próxima etiqueta (máx 3).
    for (let j = i + 1; j < porLinea.length && j - i <= 3; j++) {
      if (esEtiqueta(porLinea[j])) break
      const cand = `${valor} ${porLinea[j]}`.trim()
      if (cand.split(/\s+/).length > 24) break
      valor = cand
    }
    // Corta la etiqueta siguiente si quedó pegada al valor.
    const ci = valor.search(/\s+(?=[A-ZÁÉÍÓÚ][A-Za-zÁÉÍÓÚáéíóúÑñ]+(?:\s+[A-Za-zÁÉÍÓÚáéíóúÑñ]+){0,4}\s*:?\s*\(\d+\))/)
    if (ci > 0) valor = valor.slice(0, ci).trim()
    if (valor) crudo[def.campo] = valor
  }
  // Respaldo regex (texto aplanado sin \n, p. ej. DOCX de una línea).
  const linea = (re: RegExp) => t.match(re)?.[1]?.trim().replace(/\s+/g, ' ') ?? ''
  if (!crudo.division) crudo.division = linea(/divisi[oó]n\s*:?\s*(?:\(\d+\)\s*)?(.+?)(?:docente|asignatura|plan|clave|fecha|per[ií]odo|grupo)/is)
  if (!crudo.docente) crudo.docente = linea(/docente\s*:?\s*(?:\(\d+\)\s*)?(.+?)(?:asignatura|plan|clave|fecha)/is)
  if (!crudo.asignatura) crudo.asignatura = linea(/asignatura\s*:?\s*(?:\(\d+\)\s*)?(.+?)(?:plan|clave|fecha|per[ií]odo|horas|caracterizaci)/is)
  if (!crudo.grupo) crudo.grupo = linea(/grupo\s*:?\s*(?:\(\d+\)\s*)?([A-Za-z0-9\- ]+?)(?:horas|per[ií]odo|cr[eé]ditos)/is)
  if (!crudo.periodo) crudo.periodo = linea(/per[ií]odo\s*:?\s*(?:\(\d+\)\s*)?(\d{4}\s*-\s*\d)/i)
  if (!crudo.plan) crudo.plan = linea(/plan de estudios\s*:?\s*(?:\(\d+\)\s*)?(.+?)(?:clave)/is)
  if (!crudo.clave) crudo.clave = linea(/clave[^\n]*?:?\s*(?:\(\d+\)\s*)?([A-Z0-9\s\-–—]+?)(?:fecha)/i)
  // Normalizar igual que en las tablas del DOCX (`ACF - 2301` → `ACF-2301`).
  return {
    division: sinNumeroCampo((crudo.division ?? '').replace(/\s+/g, ' ')),
    docente: sinNumeroCampo((crudo.docente ?? '').replace(/\s+/g, ' ')),
    asignatura: sinNumeroCampo((crudo.asignatura ?? '').replace(/\s+/g, ' ')),
    grupo: normalizarCampo('grupo', sinNumeroCampo(crudo.grupo ?? '')),
    periodo: normalizarCampo('periodo', sinNumeroCampo(crudo.periodo ?? '')),
    plan: normalizarCampo('plan', sinNumeroCampo(crudo.plan ?? '')),
    clave: normalizarCampo('clave', sinNumeroCampo(crudo.clave ?? '')),
  }
}

/** Número de competencia: el parentetizado final del segmento. */
export function extraerNumeroCompetencia(seg: string, fallback: string): string {
  const sinCampo = seg.replace(/^\s*[^0-9]*?\d+\)\s*/, '')
  const m = sinCampo.match(/^(\d+(?:\s*[,/]\s*\d+)*)\s*(?:\((\d+)\))?/)
  if (!m) {
    const simple = seg.match(/^\s*(?:\(\d+\)\s*)?(\d+(?:\s*[,/]\s*\d+)*)/)
    if (simple) return simple[1].replace(/\s+/g, '')
    return fallback
  }
  if (m[2]) return m[2]
  return m[1].replace(/\s+/g, '')
}

/** Las palabras de corte solo valen como encabezado (no dentro de otra). */
const NO_LETRA = '(?<![A-Za-zÁÉÍÓÚáéíóúÑñ])'
const FIN_DESC = `(?:${NO_LETRA}temas|${NO_LETRA}actividades|${NO_LETRA}horas|${NO_LETRA}encuadre|${NO_LETRA}desarrollo|${NO_LETRA}indicadores)`

/** Descripción de la competencia (multilínea en el PDF). */
export function extraerDescripcion(seg: string): string {
  // La descripción ocupa varios renglones.
  return seg.match(new RegExp(`descripci[oó]n\\s*\\(?\\d*\\)?\\s*:?\\s*([\\s\\S]+?)${FIN_DESC}`, 'is'))?.[1]?.trim() ?? ''
}

function extraerCompetencias(raw: string, _xml: string, _html: string): Competencia[] {
  const comps: Competencia[] = []
  // Segmentar por "Competencia No.:" — exigir punto para no partir en "Competencia no alcanzada"
  const partes = raw.split(/competencia\s*no\.\s*:?/i).slice(1)
  if (partes.length === 0) {
    // Fallback: buscar "descripción" + "temas y subtemas"
    const desc = raw.match(new RegExp(`descripci[oó]n\\s*\\(?\\d*\\)?\\s*:?\\s*(.+?)${FIN_DESC}`, 'is'))?.[1]?.trim()
    if (desc) comps.push({ numero: '1', descripcion: limpiar(desc), temas: extraerTemas(raw), indicadores: extraerIndicadores(raw), evidenciasSugeridas: extraerEvidencias(raw) })
    return comps
  }
  for (const seg of partes) {
    const numero = extraerNumeroCompetencia(seg, String(comps.length + 1))
    const descripcion = extraerDescripcion(seg)
    const temas = extraerTemas(seg)
    const indicadores = extraerIndicadores(seg.length > 200 ? seg : raw)
    const evidencias = extraerEvidencias(seg)
    if (descripcion || temas.length) {
      comps.push({
        numero,
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

const ENCABEZADO_TEMA = /^(actividades|horas|indicadores|matriz|niveles|desarrollo|desarrollar|asignatura|docente|temas|para\b|espec[ií]fica|pr[aá]cticas)/i
const INICIO_TEMA = /^\d+(?:\.\d+)+\s*[:.)-]?\s*\S/
const RENGLON_HORAS = /^\d+\s*(horas|h)\b/i

export function extraerTemas(seg: string): string[] {
  // Solo inician tema las filas `N.M`; las continuaciones se unen con reglas.
  const m = seg.match(/temas y subtemas[\s\S]{0,200}?([\s\S]+?)(?:indicadores de alcance|matriz de evaluaci|niveles de desempe)/i)
  const bloque = m?.[1] ?? seg
  const lineas = bloque.split('\n').map((l) => l.trim()).filter(Boolean)
  const unidos: string[] = []
  let prevEsTema = false
  for (const l of lineas) {
    if (ENCABEZADO_TEMA.test(l) || RENGLON_HORAS.test(l) || /^(ASIGNATURA|DOCENTE)\s*:/i.test(l)) {
      prevEsTema = false
      continue
    }
    if (INICIO_TEMA.test(l)) {
      if (l.length < 220) {
        unidos.push(l)
        prevEsTema = true
      } else {
        prevEsTema = false
      }
      continue
    }
    const prev = unidos[unidos.length - 1]
    const palabras = l.split(/\s+/).length
    const continua = prevEsTema && prev !== undefined &&
      (/^[a-záéíóúñ]/.test(l) || (palabras <= 4 && /[:?]$/.test(prev)))
    if (continua) {
      const cand = `${prev} ${l}`
      if (cand.length < 220) {
        unidos[unidos.length - 1] = cand
        prevEsTema = true
        continue
      }
    }
    // Fila inicial sin número: solo antes del primer tema numerado.
    if (unidos.length === 0 && l.length >= 3 && l.length < 120 && !/\(\d+\)/.test(l)) {
      unidos.push(l)
      prevEsTema = false
      continue
    }
    prevEsTema = false
  }
  let temas = unidos.slice(0, 40)
  // Fallback en línea: texto aplanado sin \n (`…1.1 Los números… 1.2 …`).
  if (temas.filter((l) => INICIO_TEMA.test(l)).length === 0) {
    const plano = bloque.replace(/\s+/g, ' ')
    const encontrados = plano.match(/\b\d+\.\d+(?:\.\d+)*\s*[:.)-]?\s+[A-Za-zÁÉÍÓÚÑñ][^.]{3,130}/g) ?? []
    temas = encontrados.map((s) => s.trim()).slice(0, 40)
  }
  if (temas.length) return temas
  return lineas.filter((l) => l.length > 8 && l.length < 160).slice(0, 12)
}

/** Línea de encabezado dentro del bloque (no es indicador). */
function esCabeceraIndicador(l: string): boolean {
  return /^(valor del indicador|indicadores de alcance|valoraci)/i.test(l)
}

export function extraerIndicadores(texto: string): IndicadorAlcance[] {
  const inds: IndicadorAlcance[] = []
  // El número de campo varía por documento.
  const bloque = texto.match(/indicadores de alcance\s*(?:\(\d+\))?([\s\S]+?)(?:niveles?\s+de desempe|matriz|valoraci)/i)?.[1] ?? texto
  // Con letra (`A) …`) o viñetas sin letra (descripción y valor seguidos).
  const conLetra = (bloque.match(/^\s*[A-Z][.)]/gm) ?? []).length
  const estricto = conLetra >= 3
  const usadas = new Set<string>()
  const libre = (): string | null => {
    for (let c = 65; c <= 90; c++) {
      const l = String.fromCharCode(c)
      if (!usadas.has(l)) return l
    }
    return null
  }
  const volcar = (cur: { letra: string | null; desc: string; valor: number | null }) => {
    const desc = limpiar(cur.desc).slice(0, 300)
    if (desc.length < 5 || /^(valor|competencia|desempe|nivel)/i.test(desc)) return
    let letra = cur.letra
    if (!letra || usadas.has(letra)) letra = libre()
    if (!letra) return
    usadas.add(letra)
    // El porcentaje de la matriz no se guarda: solo letra y descripción.
    inds.push({ letra, descripcion: desc, valor: null })
  }
  // Por líneas, acumulando continuaciones.
  let cur: { letra: string | null; desc: string; valor: number | null } | null = null
  const lineas = bloque.split('\n').map((l) => l.trimEnd())
  for (const cruda of lineas) {
    const l = cruda.trim()
    if (!l) continue
    if (esCabeceraIndicador(l)) {
      if (cur) {
        volcar(cur)
        cur = null
      }
      continue
    }
    const mv = l.match(/^(\d{1,3})\s*%?$/) // renglón solo con el valor
    if (mv) {
      if (cur) {
        volcar(cur)
        cur = null
      }
      continue
    }
    const ml = l.match(/^\s*([A-Z])[.)]\s*(.+?)(?:\s+(\d{1,3})\s*%?)?\s*$/)
    if (ml) {
      if (cur) volcar(cur)
      // Sin auto-cierre: las líneas siguientes pueden continuar la descripción.
      cur = { letra: ml[1], desc: limpiar(ml[2].replace(/\s*\d{1,3}\s*%$/, '')), valor: null }
      continue
    }
    // Descripción o continuación (en estricto solo si hay indicador abierto).
    if (estricto && !cur) continue
    if (!cur) cur = { letra: null, desc: '', valor: null }
    cur.desc = cur.desc ? `${cur.desc} ${l}` : l
    if (inds.length >= 12) break
  }
  if (cur) volcar(cur)
  // Reserva para texto aplanado sin saltos.
  if (inds.length < 2) {
    const plano = ` ${bloque.replace(/\s+/g, ' ')} `
    for (const m of plano.matchAll(/\s([A-Z])\)\s*(.{5,240}?)\s+(\d{1,3})\s*%?(?=\s+[A-Z]\)|\s*(?:Niveles?|Matriz|Valoraci|Desempe|$))/g)) {
      const letra = m[1]
      if (inds.some((x) => x.letra === letra)) continue
      const desc = limpiar(m[2].replace(/\s*\d{1,3}\s*%?$/, ''))
      if (desc.length < 5 || /^(valor|competencia|desempe|nivel)/i.test(desc)) continue
      inds.push({ letra, descripcion: desc.slice(0, 300), valor: null })
      if (inds.length >= 12) break
    }
  }
  return inds.sort((a, b) => a.letra.localeCompare(b.letra))
}

export function extraerEvidencias(seg: string): string[] {
  // El `Total (N)` varía por documento y puede partirse en líneas.
  const m = seg.match(/matriz de evaluaci[\s\S]+?(?:evidencia de aprendizaje[\s\S]+?)([\s\S]{0,3000}?)(?:total\s*\(?\d+\)?|calendarizaci|$)/i)
  if (!m) return []
  const bloque = m[1]
  // 1) Por líneas: la descripción ocupa 1-3 renglones y cierra con `% …`.
  const acum: string[] = []
  let buf = ''
  const empujar = () => {
    const limpio = limpiarEvidencia(buf)
    if (limpio) acum.push(limpio)
    buf = ''
  }
  for (const cruda of bloque.split('\n')) {
    const l = cruda.trim()
    if (!l) continue
    if (/^(asignatura|docente)\s*:/i.test(l)) continue
    // Encabezado de la matriz: marcadores (NN) sin porcentaje de evidencia.
    if (/\(\d{2}\)/.test(l) && !/\d+\s*%/.test(l)) continue
    // Fila de letras de columna (`A B C D E F`).
    if (/^([A-F]\s+){2,}[A-F]\s*$/.test(l)) continue
    if (/^(evidencia|%|indicador|evaluaci|matriz|total|asignatura)/i.test(l) && l.length < 90 && !/%/.test(l)) continue
    buf = buf ? `${buf} ${l}` : l
    if (/%/.test(l)) empujar()
  }
  if (buf) empujar()
  // 2) Fallback en línea para texto aplanado.
  if (acum.length === 0) {
    const plano = bloque.replace(/\s+/g, ' ')
    for (const mm of plano.matchAll(/([A-ZÁÉÍÓÚ][^.%X]{15,260}?)\s*\d+%\s*(?:X[\sX]*HETEROEVALUACI[OÓ]N)?/gi)) {
      const limpio = limpiarEvidencia(mm[1])
      if (limpio) acum.push(limpio)
      if (acum.length >= 10) break
    }
  }
  return acum.slice(0, 10)
}

function limpiarEvidencia(s: string, minLen = 12): string {
  const t = s
    // pdf.js inyecta un espacio en números muy juntos (`clase 1 7` = clase 17).
    .replace(/\b(clase|actividad)\s+(\d)\s+(\d)\b/gi, '$1 $2$3')
    .replace(/\d+\s*%\s*/g, ' ')
    .replace(/\bX\b/gi, ' ')
    .replace(/heteroevaluaci[oó]n/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[:\-–—\s]+/, '')
    .replace(/(?:\s+\d{1,3})+\s*$/, '') // valores de indicador residuales (`…computadora 15 15`)
    .trim()
  if (t.length < minLen || t.length > 280) return ''
  if (/^(\d+%|hetero|auto|coev|total)/i.test(t)) return ''
  if (/^(A|B|C|D|E|F)$/i.test(t)) return ''
  return t
}

// ---- Extracción estructural por filas (tablas DOCX / renglones PDF) ----
// Cada fila se clasifica por su contenido (competencia, temas, indicadores,
// matriz, niveles) y solo la primera columna aporta temas e indicadores.
// Los encabezados de tabla, las columnas vecinas y la matriz de niveles
// nunca entran a los datos; el porcentaje se descarta (valor null).

export interface FilaEstruct {
  celdas: string[]
  xs: number[]
  ws: number[]
  ys: number[]
}

export interface ItemPdfEstruct {
  str?: string
  transform?: number[]
  width?: number
}

/** Filas en orden del documento a partir de las tablas del .docx. */
export function filasDeDocx(docXml: string): FilaEstruct[] {
  const filas: FilaEstruct[] = []
  const body = docXml.match(/<w:body[\s>][\s\S]*<\/w:body>/)?.[0] ?? docXml
  for (const tm of body.matchAll(/<w:tbl[\s>][\s\S]*?<\/w:tbl>/g)) {
    for (const rm of tm[0].matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)) {
      const celdas = [...rm[0].matchAll(/<w:tc[\s>][\s\S]*?<\/w:tc>/g)].map((cm) =>
        textoParrafos(cm[0]).join('\n'),
      )
      filas.push({ celdas, xs: [], ws: [], ys: [] })
    }
  }
  return filas
}

const TOL_FILA_PDF = 2.5
const UMBRAL_COLUMNA_PDF = 12
const UMBRAL_ANCHO_COL1 = 60
const TOL_MISMA_LINEA = 0.75
const TOL_COLUMNA_PDF = 3
const SOPORTE_COLUMNA_PDF = 4

/** Inicios de columna repetidos en la página (x con soporte en varias filas). */
function columnasDePagina(segs: { x: number; y: number }[]): number[] {
  const orden = [...segs].sort((a, b) => a.x - b.x)
  const grupos: { x: number; ys: Set<number> }[] = []
  for (const s of orden) {
    const g = grupos[grupos.length - 1]
    if (g && s.x - g.x <= TOL_COLUMNA_PDF) g.ys.add(s.y)
    else grupos.push({ x: s.x, ys: new Set([s.y]) })
  }
  return grupos.filter((g) => g.ys.size >= SOPORTE_COLUMNA_PDF).map((g) => g.x)
}

/** Filas en orden a partir de los fragmentos de pdf.js (agrupados por y). */
export function filasDePdf(paginas: ItemPdfEstruct[][]): FilaEstruct[] {
  const filas: FilaEstruct[] = []
  for (const items of paginas) {
    const segs = items
      .filter((it) => (it.str ?? '') !== '')
      .map((it) => ({
        x: it.transform?.[4] ?? 0,
        y: it.transform?.[5] ?? 0,
        w: it.width ?? 0,
        texto: (it.str ?? '').replace(/\s+/g, ' ').trim(),
      }))
      .filter((s) => s.texto !== '')
    segs.sort((a, b) => b.y - a.y || a.x - b.x)
    const columnas = columnasDePagina(segs)
    let actual: typeof segs = []
    let yRef = Infinity
    const vaciar = () => {
      if (actual.length === 0) return
      actual.sort((a, b) => a.x - b.x)
      const celdas: string[] = []
      const xs: number[] = []
      const ws: number[] = []
      const ys: number[] = []
      for (const s of actual) {
        const prevX = xs[xs.length - 1] ?? Infinity
        const prevW = ws[ws.length - 1] ?? 0
        if (celdas.length > 0 && s.x - (prevX + prevW) < UMBRAL_COLUMNA_PDF) {
          // Un fragmento que arranca en otra columna abre celda aunque el
          // hueco sea corto (columnas encimadas en el PDF original).
          const cruza = columnas.some((c) => Math.abs(c - s.x) <= TOL_COLUMNA_PDF &&
            Math.abs(c - prevX) > TOL_COLUMNA_PDF)
          if (!cruza) {
            const prev = celdas[celdas.length - 1]
            const hueco = s.x - (prevX + prevW)
            // Números partidos por el PDF (`clase 1` + `7`): sin espacio.
            const unirNumero = hueco >= 0 && hueco < 2.5 && /\d$/.test(prev) && /^\d+\b/.test(s.texto)
            celdas[celdas.length - 1] = /[\s\-–—]$/.test(prev) || unirNumero
              ? prev + s.texto
              : prev + ' ' + s.texto
            ws[ws.length - 1] = s.x + s.w - prevX
            continue
          }
        }
        celdas.push(s.texto)
        xs.push(s.x)
        ws.push(s.w)
        ys.push(s.y)
      }
      filas.push({ celdas, xs, ws, ys })
      actual = []
    }
    for (const s of segs) {
      if (Math.abs(s.y - yRef) > TOL_FILA_PDF) {
        vaciar()
        yRef = s.y
      }
      actual.push(s)
    }
    vaciar()
  }
  return filas
}

/** Número de competencia: parentetizado final o dígitos iniciales. */
export function numeroFinal(txt: string, fallback: string): string {
  const t = sinInvisibles(txt).replace(/\s+/g, ' ').trim()
  const par = t.match(/\(\s*(\d+)\s*\)\s*$/)
  if (par) return par[1]
  const ini = t.match(/^\D{0,8}(\d+)/)
  if (ini) return ini[1]
  return fallback
}

export interface TrozoTema {
  texto: string
  numerado: boolean
  suelto: boolean
}

/** Divide una celda de temas en piezas (respeta párrafos y marcas N.M). */
export function trozarTemas(celda: string): TrozoTema[] {
  const out: TrozoTema[] = []
  for (const p of celda.split('\n')) {
    // Sin partir dentro de un número (`1.2.1` no se rompe en `2.1`).
    for (const c of p.split(/(?<![\d.])(?=\d+\.(?:\d+\.?)*)/)) {
      const texto = limpiar(c)
      if (texto.length < 2) continue
      if (/^[\d.\s%–—-]+$/.test(texto)) continue // resto numérico, no es tema
      // Sin exigir frontera (`1.2Panorama` también es marca válida).
      const numerado = /^\d+\.(?:\d+\.?)*(?![\d.])/.test(texto)
      if (numerado && !/[A-Za-zÁÉÍÓÚáéíóúñ]/.test(texto)) continue // número sin título
      // Nota en mayúsculas (renglón administrativo): pieza propia, no se pega.
      const letras = texto.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ]/g, '')
      const suelto = !numerado && letras.length > 3 && !/[a-záéíóúñ]/.test(texto)
      out.push({ texto, numerado, suelto })
    }
  }
  return out
}

interface IndAcum {
  letra: string | null
  desc: string
}

/** Renglones administrativos del FO-44: no son temas ni continúan el tema previo. */
const FILA_ADMIN = /^(?:encuadre\b|evaluaci[oó]n\s+diagn[oó]stica\b|firma\s+del\b|presentaci[oó]n\s+de(?:l)?\s+(?:sgi|encuadre)\b|(?:aplicaci[oó]n\s+de\s+)?segundas\s+oportunidades\b)/i

/** Competencias a partir de filas clasificadas por estructura. */
export function competenciasDeFilas(filas: FilaEstruct[]): Competencia[] {
  const comps: Competencia[] = []
  let numero = ''
  let descripcion = ''
  let temas: string[] = []
  let inds: IndAcum[] = []
  let evs: string[] = []
  let maxNum = 0
  let modo: 'nada' | 'temas' | 'inds' | 'matriz' | 'ignorar' = 'nada'
  let col1x = 0
  let indAbierto: IndAcum | null = null
  let matBuf = ''
  let notaAdmin = false
  const tomarNumero = (n: string, alternativa: string) => {
    numero = numeroFinal(n, alternativa)
    const v = parseInt(numero, 10)
    if (!isNaN(v) && v > maxNum) maxNum = v
  }
  const volcarComp = () => {
    if (numero !== '' && (descripcion !== '' || temas.length > 0 || inds.length > 0)) {
      const letras = new Set<string>()
      const finales: IndicadorAlcance[] = []
      for (const ind of inds) {
        const d = ind.desc.replace(/\s+/g, ' ').trim()
        if (d.length < 5 || /^(valor|competencia|desempe|nivel)/i.test(d)) continue
        let letra = ind.letra
        if (!letra || letras.has(letra)) {
          letra = null
          for (let c = 65; c <= 90; c++) {
            if (!letras.has(String.fromCharCode(c))) {
              letra = String.fromCharCode(c)
              break
            }
          }
        }
        if (!letra) continue
        letras.add(letra)
        finales.push({ letra, descripcion: d.slice(0, 300), valor: null })
      }
      finales.sort((a, b) => a.letra.localeCompare(b.letra))
      comps.push({
        numero,
        descripcion: descripcion.replace(/\s+/g, ' ').trim().slice(0, 1200),
        temas: temas.slice(0, 40),
        indicadores: finales,
        evidenciasSugeridas: evs.slice(0, 10),
      })
    }
    numero = ''
    descripcion = ''
    temas = []
    inds = []
    evs = []
    indAbierto = null
    matBuf = ''
    notaAdmin = false
    modo = 'nada'
  }
  for (let fi = 0; fi < filas.length; fi++) {
    const f = filas[fi]
    const celdas = f.celdas.map((c) => sinInvisibles(c))
    const t = celdas.join(' ').replace(/\s+/g, ' ').trim()
    if (!t) continue
    // Para clasificar se mira la primera columna: las vecinas traen
    // textos (`fuentes de información`, `firma ...`) que disparan reglas.
    const tc = f.xs.length > 0 && col1x > 0
      ? celdas.filter((_, i) => (f.xs[i] ?? 0) < col1x + UMBRAL_ANCHO_COL1).join(' ').replace(/\s+/g, ' ').trim()
      : t
    // Tablas FO-14 de ejemplo al final del documento: ahí termina la instrumentación.
    if (/nombre y n[uú]mero de control|fecha de entrega/i.test(tc)) break
    if (/competencia\s*no\./i.test(tc)) {
      const iNo = celdas.findIndex((c) => /competencia\s*no\./i.test(c))
      // El número puede ir en la celda siguiente o dos después (`No. : | (19) | 1`).
      const esNumCampo = (s: string) =>
        /^[^0-9a-zA-Záéíóúñ]*[\(☹\[]\s*\d+\s*[\)\]]?[^0-9a-zA-Záéíóúñ]*$/.test(s)
      let cands: string[]
      if (iNo >= 0) {
        const misma = celdas[iNo].replace(/[\s\S]*?competencia\s*no\.\s*:?\s*/i, '').trim()
        cands = [misma, celdas[iNo + 1] ?? '', celdas[iNo + 2] ?? '']
          .map((s) => s.trim())
          .filter(Boolean)
      } else {
        const resto = t.replace(/[\s\S]*?competencia\s*no\.\s*:?\s*/i, '')
        cands = [...resto.matchAll(/\(?\s*\d+[\d\s/,.]*\)?\.?/g)].map((m) => m[0].trim())
      }
      const numTxt = cands.find((c) => !esNumCampo(c)) ?? cands[0] ?? ''
      const iDesc = celdas.findIndex((c) => /descripci/i.test(c))
      let desc = ''
      if (iDesc >= 0) {
        const misma = celdas[iDesc].replace(/[\s\S]*?descripci[oó]n\s*\(?[^)]*\)?\s*:?\s*/i, '').trim()
        desc = [misma, ...celdas.slice(iDesc + 1)].join(' ').replace(/\s+/g, ' ').trim()
        // Etiqueta y número en celdas previas (`Descripción | (20): | ...`).
        desc = desc.replace(/^\s*\([^)]{0,8}\)\s*:?\s*/, '')
      }
      volcarComp()
      tomarNumero(numTxt, String(maxNum + 1))
      descripcion = limpiar(desc)
      if (!descripcion) {
        // Inicio partido por el salto de página: hasta 2 renglones previos.
        const previas: string[] = []
        for (let k = fi - 1; k >= 0 && previas.length < 2; k--) {
          const g = filas[k]
          const gt = g.celdas.join(' ').replace(/\s+/g, ' ').trim()
          if (!gt || g.celdas.length !== 1) break
          if (gt.length < 20 || gt.length >= 300 || /^\d+$/.test(gt)) break
          if (/^(asignatura|docente)\s*:/i.test(gt)) break
          if (/competencia\s*no\.|temas y subtemas|indicadores de alcance|niveles?\s+de\s+desempe|evidencias?\s+de\s+aprendizaje|matriz de evaluaci|nombre y número de control|fecha de entrega|calendarizaci|fuentes de informaci|semana fecha|firma del|jefatura de divisi|análisis por competencias|atributo|intención/i.test(gt)) break
          previas.unshift(gt)
        }
        if (previas.length > 0) descripcion = limpiar(previas.join(' '))
      }
      continue
    }
    if (/nivel(es)?\s+de\s+desempe/i.test(tc)) {
      modo = 'ignorar'
      continue
    }
    if (/evidencias?\s+de\s+aprendizaje|matriz de evaluaci/i.test(tc)) {
      modo = 'matriz'
      matBuf = ''
      continue
    }
    if (/temas y subtemas/i.test(tc)) {
      // Encabezado sin fila de competencia previa: arranca la siguiente.
      if (numero === '' || temas.length > 0) {
        volcarComp()
        tomarNumero('', String(maxNum + 1))
      }
      modo = 'temas'
      col1x = f.xs.length > 0 ? Math.min(...f.xs) : 0
      continue
    }
    if (/indicadores de alcance/i.test(tc)) {
      modo = 'inds'
      indAbierto = null
      continue
    }
    if (/calendarizaci|fuentes de informaci|semana fecha|firma del|jefatura de divisi/i.test(tc)) {
      modo = 'ignorar'
      continue
    }
    if (/análisis por competencias/i.test(tc)) {
      continue
    }
    // Descripción que envuelve renglones de ancho completo tras el encabezado.
    if (modo === 'nada' && numero !== '' && celdas.length === 1 &&
      t.length >= 4 && t.length < 300 && !/^\d+$/.test(t) &&
      !/^(asignatura|docente)\s*:/i.test(t)) {
      descripcion = descripcion ? `${descripcion} ${t}`.replace(/\s+/g, ' ').trim() : t
      continue
    }
    if (modo === 'temas' && numero !== '') {
      // Primera columna por posición: el contenido de la 2.ª arranca
      // más de 100 unidades a la derecha del inicio de la 1.ª.
      let izq: string
      if (f.xs.length > 0 && col1x > 0) {
        // Misma línea que la celda izquierda y dentro del ancho de la columna.
        const y0 = f.ys[0] ?? 0
        izq = celdas
          .filter((c, i) => (f.xs[i] ?? 0) < col1x + UMBRAL_ANCHO_COL1 &&
            Math.abs((f.ys[i] ?? y0) - y0) <= TOL_MISMA_LINEA &&
            !/^\s*actividad\s*\d+/i.test(c))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
      } else {
        izq = (celdas[0] ?? '').replace(/\s+/g, ' ').trim()
      }
      // Restos del encabezado pegados al primer tema (`...competencia X.Y ...`).
      izq = izq.replace(/^(para desarrollar la( competencia)?|específica\s*\(\d+\)|temas y subtemas[^.]*?)\s*/i, '')
      if (!izq || /^(asignatura|docente)\s*:/i.test(izq) ||
        /temas y subtemas|competencia espec|desarrollar la comp|^espec[ií]fica/i.test(izq) ||
        /^\d+\s*h(oras)?\b/i.test(izq) || /^hp\s*=/i.test(izq)) continue
      for (const tr of trozarTemas(izq)) {
        // Notas administrativas (encuadre, segundas oportunidades): se
        // descartan con sus continuaciones hasta el siguiente tema numerado.
        if (FILA_ADMIN.test(tr.texto)) {
          notaAdmin = true
          continue
        }
        if (notaAdmin) {
          if (tr.numerado) notaAdmin = false
          else continue
        }
        // Viñetas de otras columnas y pesos de evaluación: nunca son temas.
        const sinVineta = tr.texto.split(/[•·▪]/)[0].trim()
        if (sinVineta.length < 2 || /%|test final/i.test(sinVineta)) continue
        const limpio = sinVineta.replace(/\s*[•·▪]+\s*$/, '')
        if (limpio.length < 2) continue
        if (tr.numerado) {
          temas.push(limpio.slice(0, 260))
        } else if (temas.length === 0 || tr.suelto) {
          temas.push(limpio)
        } else if (limpio.split(/\s+/).length <= 8) {
          // Continuación del tema previo (renglón corto envuelto).
          const cand = `${temas[temas.length - 1]} ${limpio}`
          temas[temas.length - 1] = cand.length <= 260 ? cand : limpio
        }
        // Renglón largo sin marca: columna vecina, se descarta.
      }
      continue
    }
    if (modo === 'inds' && numero !== '') {
      // En DOCX cada renglón trae [descripción, valor]: basta la primera celda.
      const base = (celdas.length > 1 && f.xs.length === 0 ? celdas[0] : t).replace(/\s+/g, ' ').trim()
      if (!base || /^(asignatura|docente)\s*:/i.test(base)) continue
      if (/^\d{1,3}(?:\.\d+)?\s*%?$/.test(base)) continue // renglón solo con el valor
      const sinValor = base.replace(/\s*\d{1,3}(?:\.\d+)?\s*%\s*$/, '')
      const ml = sinValor.match(/^\s*([A-Z])\s*[.)]\s*(.+?)\s*$/)
      if (ml) {
        const d = ml[2].replace(/\s*\d{1,3}(?:\.\d+)?\s*%?\s*$/, '').trim()
        indAbierto = d.length >= 3 ? { letra: ml[1], desc: d } : null
        if (indAbierto) inds.push(indAbierto)
        continue
      }
      if (/^(valor|indicadores de alcance)/i.test(sinValor) || sinValor.length < 3) continue
      const descLimpia = sinValor.replace(/\s*\d{1,3}(?:\.\d+)?\s*$/, '')
      if (indAbierto?.letra) {
        if (descLimpia.length >= 3) {
          indAbierto.desc = `${indAbierto.desc} ${descLimpia}`.replace(/\s+/g, ' ').trim()
        }
      } else if (descLimpia.length >= 5) {
        // Renglón sin letra (formato Ética): cada uno es un indicador propio.
        indAbierto = { letra: null, desc: descLimpia }
        inds.push(indAbierto)
      }
      continue
    }
    if (modo === 'matriz' && numero !== '') {
      // Texto antes del `%`: la descripción puede repartirse en varias celdas
      // o traer el `%` pegado (`...computadora 30%`).
      const iPct = celdas.findIndex((c) => /%/.test(c))
      let base = (iPct < 0 ? celdas : [...celdas.slice(0, iPct), celdas[iPct].split('%')[0]])
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      // Restos del encabezado pegados a la evidencia (`A B C ... (31) ...`).
      base = base
        .replace(/^(\(\d+\)\s*)+/, '')
        .replace(/^(?:[A-Z][\s.]+){2,}/, '')
        .replace(/competencia\s*\(\d+\)/i, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (!base || /^(?:[A-F]\.?)$/.test(base) ||
        /^(evidencia|%|indicador|evaluaci|matriz|total|asignatura|desempe)/i.test(base)) {
        if (/^total\b/i.test(base)) matBuf = ''
        continue
      }
      // Pies de página entre renglones (`Asignatura: ...`, `Docente: ...`).
      if (/^(asignatura|docente)\s*:/i.test(base)) continue
      // Palabra suelta tras un `%`: cierre de la evidencia anterior, no una nueva.
      if (!/%/.test(t) && !/\s/.test(base) && matBuf === '' && evs.length > 0) {
        evs[evs.length - 1] = `${evs[evs.length - 1]} ${base}`.replace(/\s+/g, ' ').trim()
        continue
      }
      matBuf = matBuf ? `${matBuf} ${base}` : base
      if (/%/.test(t)) {
        const limpio = limpiarEvidencia(matBuf, 4)
        matBuf = ''
        if (limpio) evs.push(limpio)
      }
      continue
    }
  }
  volcarComp()
  const vistos = new Set<string>()
  return comps.filter((c) => (vistos.has(c.numero) ? false : (vistos.add(c.numero), true)))
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
  return sinInvisibles(s).replace(/\s+/g, ' ').replace(/^[:\-–—\s]+/, '').trim()
}
/** Quita espacios de ancho cero y marcas invisibles (letras `A.​` de Conta). */
function sinInvisibles(s: string): string {
  return s.replace(/[\u200b-\u200d\ufeff]/g, '')
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
