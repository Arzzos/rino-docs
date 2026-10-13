// Lectura de instrumentaciones FO-205P11000-44 (.docx y .pdf).
// Tolera variantes de etiquetas, tablas anidadas y saltos de línea.
// Conserva los bytes originales y la orientación para el portafolio.

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
    b64, orientacion,
  })
  return { instrumentacion }
}

// PDF
async function parsearPdf(buf: Uint8Array, b64: string, file: File, onProgreso?: (m: string) => void) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const pdf = await pdfjs.getDocument({ data: buf.slice() }).promise
  let texto = ''
  let landscape = 0
  const total = Math.min(pdf.numPages, 60)
  for (let p = 1; p <= total; p++) {
    onProgreso?.(`Leyendo PDF… página ${p}/${pdf.numPages}`)
    const page = await pdf.getPage(p)
    const vp = page.getViewport({ scale: 1 })
    if (vp.width > vp.height) landscape++
    const tc = await page.getTextContent()
    // Conserva los saltos de línea del PDF (hasEOL).
    texto += textoPdfConLayout(tc.items as { str?: string; hasEOL?: boolean }[]) + '\n'
  }
  texto = normalizarTextoExtraido(texto)
  const orientacion = landscape > pdf.numPages / 2 ? 'landscape' : 'portrait'
  const meta = extraerMeta(texto)
  const { instrumentacion } = construirInstrumentacion({
    texto, meta, nombre: file.name, mime: 'application/pdf', b64, orientacion,
  })
  return { instrumentacion }
}

/** Lógica compartida DOCX/PDF para competencias y confianza. */
export function construirInstrumentacion(args: {
  texto: string
  meta: { asignatura: string; docente: string; grupo: string; periodo: string; division: string; plan: string; clave: string }
  nombre: string
  mime: string
  b64: string
  orientacion: 'portrait' | 'landscape'
}): ParseResult {
  const { texto, meta, nombre, mime, b64, orientacion } = args
  const competencias = extraerCompetencias(texto, '', '')
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
  return t
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
    return out.replace(/\s+/g, ' ').trim()
  }
  return paras.join(' ')
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
    inds.push({ letra, descripcion: desc, valor: cur.valor !== null && cur.valor <= 100 ? cur.valor : null })
  }
  // Por líneas, acumulando continuaciones.
  let cur: { letra: string | null; desc: string; valor: number | null } | null = null
  const lineas = bloque.split('\n').map((l) => l.trimEnd())
  for (const cruda of lineas) {
    const l = cruda.trim()
    if (!l || esCabeceraIndicador(l)) continue
    const mv = l.match(/^(\d{1,3})\s*%?$/) // renglón solo con el valor
    if (mv) {
      const v = parseInt(mv[1], 10)
      if (cur && cur.valor === null && v <= 100) {
        cur.valor = v
        volcar(cur)
        cur = null
      }
      continue
    }
    const ml = l.match(/^\s*([A-Z])[.)]\s*(.+?)(?:\s+(\d{1,3})\s*%?)?\s*$/)
    if (ml) {
      if (cur) volcar(cur)
      cur = { letra: ml[1], desc: limpiar(ml[2].replace(/\s*\d{1,3}\s*%$/, '')), valor: ml[3] ? parseInt(ml[3], 10) : null }
      if (cur.valor !== null) {
        volcar(cur)
        cur = null
      }
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
      const valor = parseInt(m[3], 10)
      inds.push({ letra, descripcion: desc.slice(0, 300), valor: valor <= 100 ? valor : null })
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

function limpiarEvidencia(s: string): string {
  const t = s
    .replace(/\d+\s*%\s*/g, ' ')
    .replace(/\bX\b/gi, ' ')
    .replace(/heteroevaluaci[oó]n/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[:\-–—\s]+/, '')
    .replace(/(?:\s+\d{1,3})+\s*$/, '') // valores de indicador residuales (`…computadora 15 15`)
    .trim()
  if (t.length < 12 || t.length > 280) return ''
  if (/^(\d+%|hetero|auto|coev|total)/i.test(t)) return ''
  if (/^(A|B|C|D|E|F)$/i.test(t)) return ''
  return t
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
