import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { validarEvidencia, formatearIndicadores, parsearIndicadoresTexto, type Evidencia } from '../src/domain/types'
import { BORRADOR_MS, borradorConContenido, borradorExpirado, expiraEn, haceCuanto } from '../src/infrastructure/borradores'
import { necesitaMigracionEvidencia, normalizarEvidencia, normalizarSeccion } from '../src/domain/migrate'
import { grupoDe } from '../src/domain/types'
import { resaltarTokens, tokensPorLinea } from '../src/infrastructure/codeHighlight'
import { encajar, sanearWinAnsi } from '../src/infrastructure/pdfTheme'
import { extraerMembretesDocx } from '../src/infrastructure/docxFullRender'
import { esContinuacionVMerge } from '../src/infrastructure/docxFullRender'
import { extraerMeta, extraerMetaDeFilas, extraerMetaTablas, extraerNumeroCompetencia, extraerDescripcion, extraerTemas, extraerIndicadores, extraerEvidencias, textoPdfConLayout, normalizarTextoExtraido, construirInstrumentacion, filasDeDocx, filasDePdf, competenciasDeFilas, numeroFinal, trozarTemas } from '../src/infrastructure/instrumentParser'
import { SECCIONES_LEGALES, TERMINOS_CLAVE, TERMINOS_VERSION, aceptacionVigente } from '../src/domain/legal'
import { mapaDeIndicadores } from '../src/infrastructure/fo14Pdf'
import { generarEvidenciaPDF } from '../src/infrastructure/fo14Pdf'

/** Referencias locales (ignoradas por git): se buscan por fragmentos de materia, sin apellidos. */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const buscarRef = (...claves: string[]): string | null => {
  try {
    const hit = readdirSync(RAIZ).find((a) => {
      const base = sinAcentos(a.toLowerCase())
      return claves.every((c) => base.includes(sinAcentos(c.toLowerCase())))
    })
    return hit ? join(RAIZ, hit) : null
  } catch {
    return null
  }
}
const DOCX_CALCULO = buscarRef('calculo', 'diferencial', 'docx')
const DOCX_ETICA = buscarRef('etica', 'docx')
const PDF_CALCULO = buscarRef('calculo', 'diferencial', 'pdf')
const PDF_DISCRETAS = buscarRef('discretas', 'pdf')
const PDF_CONTA = buscarRef('conta', 'pdf')
const PDF_ADMIN = buscarRef('administracion', 'pdf')
const PDF_FUND = buscarRef('fundamentos', 'pdf')
const hayRef = (ruta: string | null): ruta is string => !!ruta && existsSync(ruta)

const base: Evidencia = {
  id: 'e1', asignaturaId: 'a1', division: 'Div', grupo: '1011V',
  asignatura: 'Cálculo', docente: 'Doc', alumnoNombre: 'A', numeroControl: '1',
  integrantes: [], fechaEntrega: 'hoy', competenciaNo: '1',
  descripcionCompetencia: 'd', indicadoresSeleccionados: ['A'],
  nombreEvidencia: 'n', bloques: [{ id: 'b', tipo: 'texto', texto: 'hola' }],
  creadaEn: 1, actualizadaEn: 1,
}

describe('validarEvidencia (FO-205P11000-14, 10 campos)', () => {
  it('válida cuando está completa', () => {
    expect(validarEvidencia(base)).toEqual([])
  })
  it('exige los 10 campos + contenido', () => {
    const vacia = validarEvidencia({ ...base, division: '', grupo: '', asignatura: '', docente: '', alumnoNombre: '', fechaEntrega: '', competenciaNo: '', descripcionCompetencia: '', indicadoresSeleccionados: [], nombreEvidencia: '', bloques: [] })
    expect(vacia.length).toBeGreaterThanOrEqual(10)
    expect(vacia.join()).toMatch(/\(1\)/)
    expect(vacia.join()).toMatch(/\(10\)/)
  })
  it('permite equipo vacío (no todo es en equipo)', () => {
    expect(validarEvidencia({ ...base, integrantes: [] })).toEqual([])
  })
  it('exige elegir materia en las evidencias del editor', () => {
    const sinMateria = validarEvidencia({ ...base, asignaturaId: '' })
    expect(sinMateria.join()).toMatch(/materia/i)
    expect(validarEvidencia(base)).toEqual([])
  })
})

describe('borradores de evidencia (autosave 15 días)', () => {
  it('expira después de 15 días', () => {
    const ahora = Date.now()
    expect(borradorExpirado(ahora - BORRADOR_MS - 1000, ahora)).toBe(true)
    expect(borradorExpirado(ahora - BORRADOR_MS + 60000, ahora)).toBe(false)
    expect(borradorExpirado(ahora, ahora)).toBe(false)
  })

  it('solo guarda si hay contenido real', () => {
    expect(borradorConContenido(base)).toBe(true)
    expect(borradorConContenido({ ...base, nombreEvidencia: '', bloques: [], indicadoresSeleccionados: [], competenciaNo: '', descripcionCompetencia: '' })).toBe(false)
    expect(borradorConContenido({ ...base, nombreEvidencia: 'Avance', bloques: [] })).toBe(true)
  })

  it('antigüedad en palabras', () => {
    const ahora = Date.now()
    expect(haceCuanto(ahora - 5 * 60000, ahora)).toBe('hace 5 min')
    expect(haceCuanto(ahora - 3 * 3600000, ahora)).toBe('hace 3 h')
    expect(haceCuanto(ahora - 4 * 86400000, ahora)).toBe('hace 4 días')
  })

  it('cuenta regresiva de caducidad', () => {
    const ahora = Date.now()
    expect(expiraEn(ahora - 1000, ahora)).toBe('en 14 días')
    expect(expiraEn(ahora - 14 * 86400000, ahora)).toBe('mañana')
    expect(expiraEn(ahora - 15 * 86400000 + 3600000, ahora)).toBe('en 1 h')
    expect(expiraEn(ahora - BORRADOR_MS - 1, ahora)).toBe('hoy')
  })
})

describe('imágenes a página completa', () => {
  const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

  it('salta a hoja nueva si quedaría encogida (usa todo el espacio)', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const { crearTema, nuevoFlujo, M_B, FOOTER_H } = await import('../src/infrastructure/pdfTheme')
    const { dibujarImagen } = await import('../src/infrastructure/fo14Pdf')
    const doc = await PDFDocument.create()
    const t = await crearTema(doc)
    const f = nuevoFlujo(t)
    const minY = M_B + FOOTER_H + 6
    const llena = f.yInicial - minY
    // Queda 40% de página: antes se encogía ahí, ahora salta a hoja nueva.
    f.y = minY + llena * 0.4
    await dibujarImagen(f, doc, PNG_1PX, undefined, 100, 1)
    expect(doc.getPageCount()).toBe(2)
  })

  it('no salta si hay espacio suficiente', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const { crearTema, nuevoFlujo } = await import('../src/infrastructure/pdfTheme')
    const { dibujarImagen } = await import('../src/infrastructure/fo14Pdf')
    const doc = await PDFDocument.create()
    const t = await crearTema(doc)
    const f = nuevoFlujo(t)
    await dibujarImagen(f, doc, PNG_1PX, undefined, 100, 1)
    expect(doc.getPageCount()).toBe(1)
  })

  it('se queda en la hoja si cabe bajo una tabla larga (indicadores extensos)', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const { crearTema, nuevoFlujo, M_B, FOOTER_H } = await import('../src/infrastructure/pdfTheme')
    const { dibujarImagen } = await import('../src/infrastructure/fo14Pdf')
    const doc = await PDFDocument.create()
    const t = await crearTema(doc)
    const f = nuevoFlujo(t)
    // La tabla de datos (5)-(9) dejó ~35% de la hoja útil.
    const minY = M_B + FOOTER_H + 6
    f.y = minY + (f.yInicial - minY) * 0.35
    await dibujarImagen(f, doc, PNG_1PX, undefined, 35, 1)
    expect(doc.getPageCount()).toBe(1)
  })

  it('se encoge y se queda si el hueco es apenas menor que la imagen', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const { crearTema, nuevoFlujo, M_B, FOOTER_H } = await import('../src/infrastructure/pdfTheme')
    const { dibujarImagen } = await import('../src/infrastructure/fo14Pdf')
    const doc = await PDFDocument.create()
    const t = await crearTema(doc)
    const f = nuevoFlujo(t)
    // Queda ~19% de hoja: la imagen mínima (25% de ancho) se pasa por poco.
    const minY = M_B + FOOTER_H + 6
    f.y = minY + (f.yInicial - minY) * 0.19
    await dibujarImagen(f, doc, PNG_1PX, undefined, 25, 1)
    expect(doc.getPageCount()).toBe(1)
  })

  it('salta a hoja nueva si el hueco es mucho menor que la imagen', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const { crearTema, nuevoFlujo, M_B, FOOTER_H } = await import('../src/infrastructure/pdfTheme')
    const { dibujarImagen } = await import('../src/infrastructure/fo14Pdf')
    const doc = await PDFDocument.create()
    const t = await crearTema(doc)
    const f = nuevoFlujo(t)
    const minY = M_B + FOOTER_H + 6
    f.y = minY + (f.yInicial - minY) * 0.1
    await dibujarImagen(f, doc, PNG_1PX, undefined, 25, 1)
    expect(doc.getPageCount()).toBe(2)
  })

  it('con pie de foto también se queda si cabe', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const { crearTema, nuevoFlujo, M_B, FOOTER_H } = await import('../src/infrastructure/pdfTheme')
    const { dibujarImagen } = await import('../src/infrastructure/fo14Pdf')
    const doc = await PDFDocument.create()
    const t = await crearTema(doc)
    const f = nuevoFlujo(t)
    const minY = M_B + FOOTER_H + 6
    f.y = minY + (f.yInicial - minY) * 0.35
    await dibujarImagen(f, doc, PNG_1PX, 'Figura 1', 30, 1)
    expect(doc.getPageCount()).toBe(1)
  })

  it('evidencia real: foto pequeña tras 6 indicadores largos sigue en la página 1', async () => {
    const letras = ['A', 'B', 'C', 'D', 'E', 'F']
    const largo = 'Analiza, plantea y resuelve problemas aplicando los teoremas de límites y derivadas en situaciones del entorno profesional, argumentando cada paso del procedimiento con lenguaje técnico.'
    const ev: Evidencia = {
      ...base,
      integrantes: [
        { nombre: 'Integrante Uno', control: '20230001' },
        { nombre: 'Integrante Dos', control: '20230002' },
        { nombre: 'Integrante Tres', control: '20230003' },
      ],
      indicadoresSeleccionados: letras,
      bloques: [
        { id: 't', tipo: 'texto', texto: 'En el siguiente reporte se presentan los ejercicios resueltos durante la unidad.' },
        { id: 'i', tipo: 'imagen', dataUrl: PNG_1PX, pie: 'Figura 1. Evidencia del trabajo en clase', anchoOriginal: 1, altoOriginal: 1, anchoPct: 25, escala: 1 },
      ],
    }
    const mapa = Object.fromEntries(letras.map((l) => [l, largo]))
    const { PDFDocument } = await import('pdf-lib')
    const bytes = await generarEvidenciaPDF(ev, mapa)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })
})

describe('migración v1 → actual', () => {
  it('detecta registros legacy sin integrantes', () => {
    const legacy = { ...base } as unknown as Record<string, unknown>
    delete legacy.integrantes
    expect(necesitaMigracionEvidencia(legacy as unknown as Evidencia)).toBe(true)
  })
  it('normaliza integrantes, imágenes y fechas', () => {
    const legacy = {
      ...base, integrantes: undefined,
      bloques: [{ id: 'i', tipo: 'imagen', dataUrl: 'data:,', anchoOriginal: 10, altoOriginal: 10 }],
    } as unknown as Evidencia
    const n = normalizarEvidencia(legacy)
    expect(n.integrantes).toEqual([])
    const img = n.bloques[0] as { anchoPct: number; escala: number }
    expect(img.anchoPct).toBe(100)
    expect(img.escala).toBe(1)
  })
  it('no toca registros ya migrados', () => {
    expect(necesitaMigracionEvidencia(base)).toBe(false)
  })
  it('deriva grupo de sección legacy', () => {
    expect(normalizarSeccion({ id: 'x', tipo: 'evidencia', titulo: 't' } as never).grupo).toBe('contenido')
    expect(grupoDe('diagnostica')).toBe('diagnostica')
  })
})

describe('resaltado offline (python/java/c/sql)', () => {
  it.each(['python', 'java', 'c', 'sql'] as const)('tokeniza %s sin fugas de tags', (lang) => {
    const code = lang === 'python' ? 'def f(x):\n    return x # c' : lang === 'sql' ? 'SELECT a FROM t -- c' : 'int f(int x) {\n  return x; // c\n}'
    const toks = resaltarTokens(code, lang, true)
    const plano = toks.map((t) => t.texto).join('')
    expect(plano).toBe(code)
    expect(plano).not.toMatch(/span/)
    expect(toks.length).toBeGreaterThan(1)
  })
  it('divide por líneas conservando todo el texto', () => {
    const code = 'a = 1\nb = 2\n'
    const lineas = tokensPorLinea(resaltarTokens(code, 'python', true))
    expect(lineas.length).toBe(3)
    expect(lineas.map((l) => l.map((t) => t.texto).join('')).join('\n')).toBe(code)
  })
  it('texto plano devuelve un solo token', () => {
    expect(resaltarTokens('hola', 'texto', true)).toHaveLength(1)
  })
})

/** Extrae texto WinAnsi de los streams (hex + literales pdf-lib). */
async function extraerTextoPaginas(bytes: Uint8Array): Promise<string> {
  const raw = Buffer.from(bytes).toString('latin1')
  const partes: string[] = []
  for (const m of raw.matchAll(/<([0-9A-Fa-f]+)>/g)) {
    const hex = m[1]
    if (hex.length < 4 || hex.length > 4000 || hex.length % 2 !== 0) continue
    let s = ''
    for (let i = 0; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16))
    if (/[a-zA-Z]{3,}/.test(s)) partes.push(s)
  }
  // pdf-lib dibuja el texto del pre-render como literales `( … )` dentro de
  // bloques de texto BT…ET (fuera hay bytes binarios de imágenes).
  for (const bt of raw.matchAll(/BT([\s\S]*?)ET/g)) {
    for (const m of bt[1].matchAll(/\(((?:\\.|[^\\()])*)\)/g)) {
      const s = m[1]
        .replace(/\\([0-7]{1,3})/g, (_: string, o: string) => String.fromCharCode(parseInt(o, 8)))
        .replace(/\\([nrtbf()\\])/g, (_: string, c: string) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' })[c] ?? c)
      if (/[a-zA-Z]{3,}/.test(s)) partes.push(s)
    }
  }
  return partes.join(' ')
}

describe('membretes con aspecto correcto', () => {  it('encajar() nunca deforma: conserva proporción', () => {
    // banner 2555×415 en caja 556×66 → alto manda
    const b = encajar(2555, 415, 556, 66)
    expect(b.h).toBeLessThanOrEqual(66)
    expect(b.w / b.h).toBeCloseTo(2555 / 415, 5)
    // footer 2550×285 en caja 492×46
    const f = encajar(2550, 285, 492, 46)
    expect(f.h).toBeLessThanOrEqual(46)
    expect(f.w / f.h).toBeCloseTo(2550 / 285, 5)
    // imagen vertical cabe por ancho
    const v = encajar(900, 1400, 488, 600)
    expect(v.w).toBeLessThanOrEqual(488)
    expect(v.w / v.h).toBeCloseTo(900 / 1400, 5)
  })

  it.runIf(hayRef(DOCX_CALCULO))('resuelve imágenes de header/footer del .docx real (first+default)', async () => {
    const buf = readFileSync(DOCX_CALCULO as string)
    const zip = await JSZip.loadAsync(buf)
    const mem = await extraerMembretesDocx(zip)
    const hImgs = mem.headers.flatMap((h) => h.imagenes)
    const fImgs = mem.footers.flatMap((h) => h.imagenes)
    expect(hImgs.length).toBeGreaterThanOrEqual(1)
    expect(fImgs.length).toBeGreaterThanOrEqual(1)
    expect(mem.headers.some((h) => /asignatura/i.test(h.texto))).toBe(true)
    expect(mem.footers.some((h) => /docente/i.test(h.texto))).toBe(true)
  }, 20000)

  it.runIf(hayRef(DOCX_CALCULO))('membretes a tamaño real del docx (banner ~790×99pt)', async () => {
    const buf = readFileSync(DOCX_CALCULO as string)
    const zip = await JSZip.loadAsync(buf)
    const mem = await extraerMembretesDocx(zip)
    const banner = mem.headers.flatMap((h) => h.imagenes)[0]
    expect(banner.wPt).toBeGreaterThan(600) // ancho casi completo en landscape
    expect(banner.wPt).toBeCloseTo(790.5, 0)
    expect(banner.hPt).toBeCloseTo(99, 0)
  }, 20000)

  it('la evidencia NO lleva autopromo en el contenido (solo metadata)', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const bytes = await generarEvidenciaPDF({ ...base, bloques: [{ id: 'b', tipo: 'texto', texto: 'contenido' }] })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getCreator()).toMatch(/Rino Docs/)
    const texto = await extraerTextoPaginas(bytes)
    expect(texto).not.toMatch(/Rino Docs|generado localmente/i)
  })
})

describe('metadatos desde tablas + indicadores completos', () => {
  it.runIf(hayRef(DOCX_CALCULO))('extrae docente/grupo/período limpios del docx real', async () => {
    const buf = readFileSync(DOCX_CALCULO as string)
    const zip = await JSZip.loadAsync(buf)
    const meta = extraerMetaTablas(await zip.file('word/document.xml')!.async('string'))
    expect(meta.docente.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2)
    expect(meta.grupo).toBe('1011V')
    expect(meta.periodo).toBe('2026-2')
    expect(meta.clave).toBe('ACF-2301')
  }, 20000)

  it('mapea letra → descripción completa para el campo (9)', () => {
    const ev = { ...base, competenciaNo: '1', indicadoresSeleccionados: ['A', 'C'] }
    const inst = { competencias: [{ numero: '1', indicadores: [{ letra: 'A', descripcion: 'Se adapta' }, { letra: 'C', descripcion: 'Propone' }] }] }
    const m = mapaDeIndicadores(ev, inst)
    expect(m.A).toBe('Se adapta')
    expect(m.B).toBeUndefined()
  })
})

describe('editor de indicadores (letra + descripción, sin porcentaje)', () => {
  it('descarta el "| ..." residual de datos guardados antes', () => {
    const inds = parsearIndicadoresTexto('A) algo | 15')
    expect(inds).toEqual([{ letra: 'A', descripcion: 'algo', valor: null }])
    const borrado = parsearIndicadoresTexto('A) algo')
    expect(borrado).toEqual([{ letra: 'A', descripcion: 'algo', valor: null }])
    expect(formatearIndicadores(borrado)).toBe('A) algo')
  })
  it('tolera "|" sin número y líneas vacías eliminables', () => {
    expect(parsearIndicadoresTexto('A) algo |')).toEqual([{ letra: 'A', descripcion: 'algo', valor: null }])
    expect(parsearIndicadoresTexto('A) uno\n\nB) dos | 10\n')).toEqual([
      { letra: 'A', descripcion: 'uno', valor: null },
      { letra: 'B', descripcion: 'dos', valor: null },
    ])
  })
  it('ida y vuelta estable', () => {
    const texto = 'A) uno\nB) dos'
    expect(formatearIndicadores(parsearIndicadoresTexto(texto))).toBe(texto)
  })
})

describe('términos y privacidad (gate de aceptación)', () => {
  it('solo la versión vigente cuenta como aceptada', () => {
    expect(aceptacionVigente(TERMINOS_VERSION)).toBe(true)
    expect(aceptacionVigente(null)).toBe(false)
    expect(aceptacionVigente('2020-01-01-v0')).toBe(false)
  })
  it('clave de almacenamiento y 9 secciones', () => {
    expect(TERMINOS_CLAVE).toBe('rino.terminos.v1')
    expect(SECCIONES_LEGALES.map((s) => s.id)).toEqual([
      'aceptacion', 'servicio', 'tesci', 'privacidad', 'contenido', 'exencion', 'propiedad', 'cambios', 'contacto',
    ])
  })
  it('el documento cubre no-afiliación, funcionamiento local y MIT', async () => {
    const fuente = readFileSync(join(RAIZ, 'app', 'src', 'ui', 'Terminos.tsx'), 'utf8')
    expect(fuente).toMatch(/no está afiliada/i)
    expect(fuente).toMatch(/LocalStorage e IndexedDB/)
    expect(fuente).toMatch(/Licencia MIT/)
    expect(fuente).toMatch(/Acepto los términos/)
  })
})

describe('SEO e indexación', () => {
  const html = readFileSync(join(RAIZ, 'app', 'index.html'), 'utf8')
  const publico = (n: string) => join(RAIZ, 'app', 'public', n)

  it('robots.txt no es HTML y declara el sitemap', () => {
    const txt = readFileSync(publico('robots.txt'), 'utf8')
    expect(txt).not.toMatch(/<html/i)
    expect(txt).toMatch(/^User-agent:\s*\*$/m)
    expect(txt).toMatch(/^Allow:\s*\/$/m)
    expect(txt).toMatch(/^Sitemap: https:\/\/rinodocs\.arzzos\.com\/sitemap\.xml$/m)
  })

  it('sitemap.xml es XML con la URL canónica', () => {
    const xml = readFileSync(publico('sitemap.xml'), 'utf8')
    expect(xml).not.toMatch(/<html/i)
    expect(xml).toContain('http://www.sitemaps.org/schemas/sitemap/0.9')
    expect(xml).toContain('<loc>https://rinodocs.arzzos.com/</loc>')
    expect(xml.match(/<url>/g)).toHaveLength(1)
  })

  it('og.png es una tarjeta de 1200×630', () => {
    const png = readFileSync(publico('og.png'))
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
  })

  it('index.html declara OpenGraph y Twitter completos', () => {
    expect(html).toContain('<meta name="robots" content="index, follow, max-image-preview:large" />')
    expect(html).toContain('<link rel="canonical" href="https://rinodocs.arzzos.com/" />')
    expect(html).toContain('<meta property="og:image" content="https://rinodocs.arzzos.com/og.png" />')
    expect(html).toContain('<meta property="og:image:width" content="1200" />')
    expect(html).toContain('<meta property="og:image:height" content="630" />')
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />')
  })

  it('los datos estructurados son JSON válido y describen la app', () => {
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    expect(m).not.toBeNull()
    const datos = JSON.parse(m?.[1] ?? '')
    expect(datos['@type']).toBe('SoftwareApplication')
    expect(datos.applicationCategory).toBe('EducationalApplication')
    expect(datos.isAccessibleForFree).toBe(true)
    expect(datos.offers.price).toBe('0')
  })

  it('la etiqueta alpha ya no sobrevive en la superficie pública', () => {
    expect(html).not.toMatch(/\balpha\b/i)
    expect(JSON.parse(readFileSync(join(RAIZ, 'app', 'package.json'), 'utf8')).version).toBe('0.1.0-beta')
    const docs = ['README.md', 'README.es.md', 'ROADMAP.md', 'ROADMAP.es.md', 'SECURITY.md', 'SECURITY.es.md', 'CONTRIBUTING.md', 'CONTRIBUTING.es.md', 'CODE_OF_CONDUCT.md', 'CODE_OF_CONDUCT.es.md', 'app/src/ui/Terminos.tsx']
    for (const f of docs) expect(readFileSync(join(RAIZ, f), 'utf8'), f).not.toMatch(/\balpha\b/i)
  })
})

describe('evidencias PDF importadas (tal cual se entregaron)', () => {
  it('validación pide nombre, competencia y archivo (sin bloques)', () => {
    const imp = { ...base, origen: 'pdf' as const, nombreEvidencia: 'Reporte', competenciaNo: '2', bloques: [], indicadoresSeleccionados: [], pdfBase64: 'eA==' }
    expect(validarEvidencia(imp)).toEqual([])
    expect(validarEvidencia({ ...imp, pdfBase64: undefined })).toContain('Archivo PDF requerido')
    expect(validarEvidencia({ ...imp, nombreEvidencia: '' }).length).toBeGreaterThan(0)
    expect(validarEvidencia({ ...imp, competenciaNo: '' }).length).toBeGreaterThan(0)
  })
  it('el portafolio copia íntegras las páginas importadas', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const src = await PDFDocument.create()
    src.addPage([300, 400])
    src.addPage([300, 400])
    const pdfBase64 = Buffer.from(await src.save()).toString('base64')
    const { ensamblarPortafolio } = await import('../src/infrastructure/portfolioPdf')
    const ev = { ...base, id: 'imp1', origen: 'pdf' as const, nombreEvidencia: 'Reporte previo', competenciaNo: '2', pdfBase64, pdfPaginas: 2, bloques: [], indicadoresSeleccionados: [] }
    const out = await ensamblarPortafolio(
      {
        id: 'p1', asignaturaId: 'a1', titulo: 'Portafolio', creadaEn: 1,
        secciones: [
          { id: 's1', tipo: 'portada', titulo: 'Portada', grupo: 'portada' },
          { id: 's2', tipo: 'indice', titulo: 'Índice', grupo: 'indice' },
          { id: 's3', tipo: 'evidencia', titulo: 'Reporte previo', refId: 'imp1', grupo: 'contenido' },
        ],
      },
      [ev], null, [],
      { asignatura: 'Cálculo', division: 'Div', alumno: 'A 1', docente: 'Doc', grupo: 'G', periodo: 'P' },
    )
    const doc = await PDFDocument.load(out)
    // portada general + 1 de índice + 2 importadas
    expect(doc.getPageCount()).toBe(4)
  })
})

describe('herencia materia → evidencia', () => {
  const perfil = { nombreCompleto: 'Alu', numeroControl: 'E1', division: 'DivP', grupo: 'G0' }
  const vacia = {
    id: '', asignaturaId: '', division: '', grupo: '', asignatura: '', docente: '',
    alumnoNombre: '', numeroControl: '', integrantes: [], fechaEntrega: 'hoy',
    competenciaNo: '', descripcionCompetencia: '', indicadoresSeleccionados: [],
    nombreEvidencia: '', bloques: [], creadaEn: 0, actualizadaEn: 0,
  }
  const mat = { id: 'm1', nombre: 'Cálculo', docente: 'Docente Ejemplo', grupo: '1011V' }

  it('elige la guardada si existe; si no, la heredada; si no, vacío', async () => {
    const { resolverMateriaInicial } = await import('../src/domain/herencia')
    // La guardada manda sobre la heredada.
    expect(resolverMateriaInicial([mat], 'm1', 'm2')).toBe('m1')
    // Sin guardada, hereda la materia filtrada de la sección.
    expect(resolverMateriaInicial([mat], '', 'm1')).toBe('m1')
    // Guardada que ya no existe: no se re-apunta a otra materia.
    expect(resolverMateriaInicial([mat], 'borrada', 'm1')).toBe('')
    // Heredada que no existe: vacío, el estudiante debe elegir.
    expect(resolverMateriaInicial([mat], '', 'borrada')).toBe('')
    // Sin ninguna: vacío (nunca se elige sola).
    expect(resolverMateriaInicial([mat], '', '')).toBe('')
    expect(resolverMateriaInicial([], '', '')).toBe('')
  })

  it('la materia guardada se resuelve por nombre si falta el id (registros viejos)', async () => {
    const { resolverMateriaGuardada } = await import('../src/domain/herencia')
    expect(resolverMateriaGuardada([mat], 'm1', 'Cálculo')).toBe('m1')
    expect(resolverMateriaGuardada([mat], '', 'Cálculo')).toBe('m1')
    expect(resolverMateriaGuardada([mat], '', '  Cálculo ')).toBe('m1')
    expect(resolverMateriaGuardada([mat], '', 'Física')).toBe('')
    expect(resolverMateriaGuardada([mat], '', '')).toBe('')
  })

  it('el cambio de materia pisa (2)(3)(4) y no arrastra datos de la anterior', async () => {
    const { aplicarMateria } = await import('../src/domain/herencia')
    const otra = { id: 'm2', nombre: 'Programación', docente: 'Docente Otro', grupo: '1011M' }
    const previa = { ...vacia, asignaturaId: 'm1', asignatura: 'Cálculo', docente: 'Docente Ejemplo', grupo: '1011V' }
    const n = aplicarMateria(previa, otra, perfil)
    expect(n.asignaturaId).toBe('m2')
    expect(n.asignatura).toBe('Programación')
    expect(n.docente).toBe('Docente Otro')
    expect(n.grupo).toBe('1011M')
  })

  it('el cambio de materia conserva el docente capturado a mano solo en su materia', async () => {
    const { aplicarMateria } = await import('../src/domain/herencia')
    const otra = { id: 'm2', nombre: 'Programación', docente: 'Docente Otro', grupo: '1011M' }
    const ajustes = { docente: { valor: 'Prof. Manual', materiaId: 'm1' } }
    // En su propia materia manda el ajuste manual.
    expect(aplicarMateria(vacia, mat, perfil, ajustes).docente).toBe('Prof. Manual')
    // En otra materia, manda el docente de esa materia.
    expect(aplicarMateria(vacia, otra, perfil, ajustes).docente).toBe('Docente Otro')
  })

  it('re-deriva (7)(8)(9) desde la instrumentación de la materia', async () => {
    const { rederivarCompetencia } = await import('../src/domain/herencia')
    const comps = [{ numero: '1', descripcion: 'Límites', indicadores: [{ letra: 'A', descripcion: 'Alfa' }, { letra: 'B', descripcion: 'Beta' }] }]
    const conComp = { ...vacia, competenciaNo: '1', descripcionCompetencia: 'Límites', indicadoresSeleccionados: ['A', 'B'] }
    const n = rederivarCompetencia(conComp, comps)
    expect(n.competenciaNo).toBe('1')
    expect(n.descripcionCompetencia).toBe('Límites')
    expect(n.indicadoresSeleccionados).toEqual(['A', 'B'])
    // Competencia que no existe en la nueva materia: se limpia.
    const limpio = rederivarCompetencia(conComp, [{ numero: '2', descripcion: 'Otra', indicadores: [] }])
    expect(limpio.competenciaNo).toBe('')
    expect(limpio.descripcionCompetencia).toBe('')
    expect(limpio.indicadoresSeleccionados).toEqual([])
    // Sin instrumentación: también se limpia.
    expect(rederivarCompetencia(conComp, undefined).competenciaNo).toBe('')
  })

  it('rellena vacíos sin pisar captura manual', async () => {
    const { aplicarHerencia, herenciaPendiente } = await import('../src/domain/herencia')
    const n = aplicarHerencia({ ...vacia }, mat, perfil)
    expect(n.asignatura).toBe('Cálculo')
    expect(n.docente).toBe('Docente Ejemplo')
    expect(n.grupo).toBe('1011V')
    expect(n.alumnoNombre).toBe('Alu')
    expect(herenciaPendiente(n, mat, perfil)).toBe(false)
    const manual = aplicarHerencia({ ...vacia, docente: 'Otro', grupo: 'G9' }, mat, perfil)
    expect(manual.docente).toBe('Otro')
    expect(manual.grupo).toBe('G9')
    expect(manual.asignatura).toBe('Cálculo')
  })

  it('sin materia no cambia nada', async () => {
    const { aplicarHerencia, herenciaPendiente } = await import('../src/domain/herencia')
    expect(aplicarHerencia({ ...vacia }, null, perfil)).toEqual({ ...vacia })
    expect(herenciaPendiente({ ...vacia }, undefined, perfil)).toBe(false)
  })
})

describe('instrumentación estándar', () => {
  it('une runs sin espacios fantasma ("202 6- 2" → "2026-2")', async () => {
    const { unirRuns, esRuido } = await import('../src/infrastructure/docxFullRender')
    const celda = '<w:tc><w:p><w:r><w:rPr/></w:rPr><w:t>202</w:t></w:r><w:r><w:t>6-</w:t></w:r><w:r><w:t>2</w:t></w:r></w:p></w:tc>'
    expect(unirRuns(celda)).toBe('2026-2')
    const normal = '<w:tc><w:p><w:r><w:t>Docente</w:t></w:r><w:r><w:t xml:space="preserve"> Ejemplo</w:t></w:r></w:p></w:tc>'
    expect(unirRuns(normal)).toBe('Docente Ejemplo')
  })

  it('detecta ruido ("Nb n") y respeta contenido real', async () => {
    const { esRuido } = await import('../src/infrastructure/docxFullRender')
    expect(esRuido('Nb n')).toBe(true)
    expect(esRuido('')).toBe(false)
    expect(esRuido('FO-205P11000-44')).toBe(false)
    expect(esRuido('80')).toBe(false)
    expect(esRuido('Caracterización de la asignatura 13)')).toBe(false)
  })

  it('sanea caracteres no imprimibles en WinAnsi sin tocar acentos', () => {
    expect(sanearWinAnsi('Competencia No. ☹18)')).toBe('Competencia No. 18)')
    expect(sanearWinAnsi('Evaluación – … •')).toBe('Evaluación – … •')
    expect(sanearWinAnsi('hola 😀 mundo')).toBe('hola  mundo')
    expect(sanearWinAnsi('Cálculo dIferencial')).toBe('Cálculo dIferencial')
  })

  it.runIf(hayRef(DOCX_ETICA))('pre-renderiza el docx de Ética sin reventar por el artefacto ☹', async () => {
    const { preRenderInstrumentacion } = await import('../src/infrastructure/docxFullRender')
    const buf = readFileSync(DOCX_ETICA as string)
    let s = ''
    for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192))
    const pre = await preRenderInstrumentacion(btoa(s))
    expect(pre.paginas).toBeGreaterThan(5)
  }, 60000)

  it('distingue inicio y continuación de fusión vertical', () => {
    expect(esContinuacionVMerge('<w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p/></w:tc>')).toBe(false)
    expect(esContinuacionVMerge('<w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p/></w:tc>')).toBe(true)
    expect(esContinuacionVMerge('<w:tc><w:p><w:r><w:t>Hola</w:t></w:r></w:p></w:tc>')).toBe(false)
  })

  it('ajusta el extent en ambos ejes tras recortar aire', async () => {
    const { ajustarExtent } = await import('../src/infrastructure/docxFullRender')
    // Pie real (footer2): extent 786×67.5 con recorte fw≈0.55, fh≈0.30.
    const pie = ajustarExtent(786, 67.5, 0.22, 0.77, 0.40, 0.70)
    expect(pie.wPt).toBeCloseTo(786 * 0.55, 0)
    expect(pie.hPt).toBeCloseTo(67.5 * 0.30, 0)
    expect(pie.hPt).toBeLessThan(25) // franja delgada, no bloque gigante
    // Sin recorte conserva el tamaño.
    expect(ajustarExtent(790.5, 99, 0, 1, 0, 1)).toEqual({ wPt: 790.5, hPt: 99 })
    // Sin extent no inventa tamaño.
    expect(ajustarExtent(0, 0, 0, 1, 0, 1)).toEqual({ wPt: 0, hPt: 0 })
  })

  it.runIf(hayRef(DOCX_CALCULO))('no duplica celdas fusionadas al pre-renderizar el docx real', async () => {
    const { preRenderInstrumentacion } = await import('../src/infrastructure/docxFullRender')
    const { base64ABytes } = await import('../src/infrastructure/instrumentParser')
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const buf = readFileSync(DOCX_CALCULO as string)
    let s = ''
    for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192))
    const pre = await preRenderInstrumentacion(btoa(s))
    const pdf = await getDocument({ data: base64ABytes(pre.pdfBase64) }).promise
    let texto = ''
    for (let p = 1; p <= pdf.numPages; p++) {
      const tc = await pdf.getPage(p).then((pg) => pg.getTextContent())
      texto += tc.items.map((it) => (it as { str?: string }).str ?? '').join(' ') + '\n'
    }
    // Las etiquetas de celdas fusionadas aparecen una vez por tabla.
    expect(texto.match(/Competencia alcanzada/g)?.length).toBe(4)
    // Encabezado de matriz fusionado × 4 matrices = 4.
    expect(texto.match(/Evidencia de aprendizaje\s*\(30\)/g)?.length).toBe(4)
  }, 60000)
})

describe('escalonados e índice', () => {
  it('wrap respeta saltos explícitos (un indicador por línea)', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib')
    const { wrap } = await import('../src/infrastructure/pdfTheme')
    const doc = await PDFDocument.create()
    const f = await doc.embedFont(StandardFonts.Helvetica)
    const ls = wrap('A) primero\nB) segundo con texto largo largo largo largo largo', f, 8, 333)
    expect(ls[0]).toBe('A) primero')
    expect(ls[1]).toMatch(/^B\) segundo/)
  })
})

describe('acciones de documento y pre-render', () => {
  it('el bloque salto divide el PDF en páginas', async () => {
    const ev = {
      ...base, bloques: [
        { id: 'a', tipo: 'texto', texto: 'primera' },
        { id: 's', tipo: 'salto' },
        { id: 'b', tipo: 'texto', texto: 'segunda' },
      ],
    } as never
    const { PDFDocument } = await import('pdf-lib')
    const bytes = await generarEvidenciaPDF(ev)
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(2)
  })

  it('solo-saltos no valida como contenido', async () => {
    const { validarEvidencia } = await import('../src/domain/types')
    expect(validarEvidencia({ ...base, bloques: [{ id: 's', tipo: 'salto' }] as never })).toContain('Agrega al menos un bloque de contenido')
  })

  it.runIf(hayRef(DOCX_CALCULO))('pre-render DOCX→PDF genera páginas landscape exactas', async () => {
    const { preRenderInstrumentacion } = await import('../src/infrastructure/docxFullRender')
    const { base64ABytes } = await import('../src/infrastructure/instrumentParser')
    const buf = readFileSync(DOCX_CALCULO as string)
    let s = ''
    for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192))
    const pre = await preRenderInstrumentacion(btoa(s))
    expect(pre.paginas).toBeGreaterThan(5)
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.load(base64ABytes(pre.pdfBase64))
    expect(doc.getPageCount()).toBe(pre.paginas)
    const b0 = doc.getPage(0).getSize()
    expect(b0.width).toBeGreaterThan(b0.height) // landscape preservado
  }, 60000)
})

describe('parseo PDF paridad con DOCX (FO-205P11000-44)', () => {
  async function textoPdfReal(path: string): Promise<string> {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const buf = readFileSync(path)
    const pdf = await getDocument({ data: new Uint8Array(buf) }).promise
    let texto = ''
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      const tc = await page.getTextContent()
      texto += textoPdfConLayout(tc.items as { str?: string; hasEOL?: boolean }[]) + '\n'
    }
    return normalizarTextoExtraido(texto)
  }

  it('respeta hasEOL en vez de aplanar todo con espacios', () => {
    const t = textoPdfConLayout([
      { str: 'A) Se adapta a situaciones', hasEOL: false },
      { str: 'complejas.', hasEOL: true },
      { str: 'B) Hace aportaciones', hasEOL: true },
    ])
    expect(t).toContain('\n')
    expect(t.split('\n').length).toBeGreaterThanOrEqual(2)
  })

  it('rompe por columnas cuando dos celdas comparten el renglón', () => {
    const t = textoPdfConLayout([
      { str: '4.12 La regla de L’Hôpital.', hasEOL: false, transform: [8, 0, 0, 8, 76.6, 454.2] },
      { str: ' ', hasEOL: false, transform: [8, 0, 0, 8, 181.7, 454.2] },
      { str: 'Aplica el criterio de la segunda', hasEOL: true, transform: [8, 0, 0, 8, 219.6, 454.2] },
    ])
    const lineas = t.split('\n').map((l) => l.trim()).filter(Boolean)
    expect(lineas[0]).toMatch(/^4\.12/)
    expect(lineas[0]).not.toMatch(/Aplica/)
    expect(lineas[1]).toMatch(/^Aplica/)
  })

  it('meta multilínea: división completa y valores en líneas partidas', () => {
    const m = extraerMeta('División : (1)\nIngeniería en Tecnologías de la Información y\nComunicaciones\nDocente : (2) Dr. Ejemplo Apellido\nAsignatura : (3) Matemáticas Discretas I\nPlan de estudios: (4) ITIC-2010-225\nClave de la asignatura: (5) TIF-1019\nFecha de elaboración: (6) Agosto de 2026\nPeríodo: (7) 2026-2\nGrupo: (8) 1011V\n')
    expect(m.division).toBe('Ingeniería en Tecnologías de la Información y Comunicaciones')
    expect(m.docente).toBe('Dr. Ejemplo Apellido')
    expect(m.asignatura).toBe('Matemáticas Discretas I')
    expect(m.grupo).toBe('1011V')
    expect(m.periodo).toBe('2026-2')
    expect(m.plan).toBe('ITIC-2010-225')
    expect(m.clave).toBe('TIF-1019')
  })

  it('número de competencia es el parentetizado final', () => {
    expect(extraerNumeroCompetencia(' (17) 1,2,3 (1) Descripción(18): Conoce', 'x')).toBe('1')
    expect(extraerNumeroCompetencia(' (17) 4/5 (2) Descripción(18): Conoce', 'x')).toBe('2')
    expect(extraerNumeroCompetencia(' (17) 8/9 (4) Descripción(18): Conoce', 'x')).toBe('4')
    expect(extraerNumeroCompetencia(' (19) 1 Descripción (20) : Reconoce', 'x')).toBe('1')
    expect(extraerNumeroCompetencia(' (19) 4 Descripción (20) : Identifica', 'x')).toBe('4')
    expect(extraerNumeroCompetencia('☹18) 1 Descripción (19): Destaca', 'x')).toBe('1')
    expect(extraerNumeroCompetencia(' (17) 2 Descripción (18): Infiere', 'x')).toBe('2')
  })

  it('une runs partidos sin crear espacios fantasma', () => {
    const t = textoPdfConLayout([
      { str: 'T', hasEOL: false, transform: [9, 0, 0, 9, 100, 400] },
      { str: 'aller de Ética', hasEOL: true, transform: [9, 0, 0, 9, 100.5, 400] },
    ])
    expect(t.trim()).toBe('Taller de Ética')
    const u = textoPdfConLayout([
      { str: 'a', hasEOL: false, transform: [9, 0, 0, 9, 100, 400] },
      { str: 'los alumnos', hasEOL: true, transform: [9, 0, 0, 9, 106.5, 400] },
    ])
    expect(u.trim()).toBe('a los alumnos')
  })

  it('temas: une renglones cortados del PDF', () => {
    const seg = 'Temas y subtemas para desarrollar la competencia específica(19)\n1.6 Funciones trascendentes:\ntrigonométricas, logarítmicas y\nexponenciales.\n1.7 Funciones definidas por\npartes.\nIndicadores de alcance(24)'
    const temas = extraerTemas(seg)
    expect(temas.length).toBeGreaterThanOrEqual(2)
    expect(temas[0]).toMatch(/^1\.6/)
    expect(temas.join(' ')).toMatch(/trigonom/)
  })

  it('temas: fallback en línea cuando no hay saltos', () => {
    const seg = 'Temas y subtemas para desarrollar la competencia específica(19) 1.1 Los números reales y sus subconjuntos. 1.2 Intervalos en los reales y su representación gráfica. Indicadores de alcance(24)'
    const temas = extraerTemas(seg)
    expect(temas.length).toBeGreaterThanOrEqual(2)
  })

  it('indicadores: valor en el renglón siguiente (caso D del PDF real)', () => {
    const seg = 'Indicadores de alcance(24) Valor del indicador(25)\nA) Se adapta a situaciones y contextos complejos. 15\nD) Introduce recursos y experiencias que promueven un pensamiento crítico; (por ejemplo,\n15\nE) Incorpora conocimientos interdisciplinarios 20\nNiveles de desempeño (26)'
    const inds = extraerIndicadores(seg)
    expect(inds.map((i) => i.letra)).toContain('A')
    const d = inds.find((i) => i.letra === 'D')
    expect(d?.valor).toBeNull()
    expect(inds.find((i) => i.letra === 'A')?.valor).toBeNull()
    expect(inds.find((i) => i.letra === 'A')?.descripcion).not.toMatch(/15|%/)
  })

  it('indicadores: fallback en línea con texto aplanado', () => {
    const seg = 'Indicadores de alcance(24) A) Se adapta a situaciones y contextos complejos. 15 B) Hace aportaciones a las actividades académicas desarrolladas 15 Niveles de desempeño'
    const inds = extraerIndicadores(seg)
    expect(inds.length).toBeGreaterThanOrEqual(2)
  })

  it('indicadores: valores con % y campo (26) de discretas', () => {
    const seg = 'Indicadores de alcance (26) Valor del indicador (27)\nA) Se adapta a situaciones y contextos complejos. 15%\nD) Introduce recursos y experiencias que promueven un pensamiento crítico; (por ejemplo,\n15%\nE) Incorpora conocimientos interdisciplinarios 20%\nDesempeño Nivel de desempeño'
    const inds = extraerIndicadores(seg)
    expect(inds.map((i) => i.letra)).toEqual(['A', 'D', 'E'])
    expect(inds.every((i) => i.valor === null)).toBe(true)
    expect(inds.find((i) => i.letra === 'A')?.descripcion).not.toMatch(/%/)
  })

  it('indicadores: multilínea completa la descripción (renglones seguidos)', () => {
    const seg = 'Indicadores de alcance (24) Valor del indicador (25)\nA) Se adapta a situaciones y contextos complejos. 15\nD) Introduce recursos y experiencias que promueven un pensamiento crítico; (por ejemplo, el uso de las tecnologías de la información estableciendo\npreviamente un criterio). Ante temas de una asignatura, introduce cuestionamientos de tipo ético\n15\nNiveles de desempeño (26)'
    const inds = extraerIndicadores(seg)
    const d = inds.find((i) => i.letra === 'D')
    expect(d?.valor).toBeNull()
    expect(d?.descripcion.replace(/\s+/g, ' ')).toMatch(/previamente un criterio/)
    expect(d?.descripcion.replace(/\s+/g, ' ')).toMatch(/cuestionamientos de tipo ético/)
  })

  it('indicadores: viñetas sin letra se emparejan A–F (formato Ética)', () => {
    const seg = 'Indicadores de alcance (24) Valor del indicador (25)\nSe adapta a situaciones y contextos complejos.\n25\nHace aportaciones a las actividades académicas desarrolladas.\n25\nF. Realiza su trabajo de manera autónoma y autoregulada\n10\nNiveles de desempeño (26)'
    const inds = extraerIndicadores(seg)
    expect(inds.map((i) => i.letra)).toEqual(['A', 'B', 'F'])
    expect(inds.map((i) => i.valor)).toEqual([null, null, null])
    expect(inds[2].descripcion).toMatch(/autónoma/)
    expect(inds[2].descripcion).not.toMatch(/^F\./)
  })

  it('evidencias: une descripción + % en renglones separados', () => {
    const seg = 'Matriz de evaluación (29) Evidencia de aprendizaje(30) % (31)\nExamen práctico: resolución de ejercicios de funciones,\ndominio, rango, operaciones y composición de funciones.\n30% X X HETEROEVALUACIÓN\nTotal\n(34)'
    const evs = extraerEvidencias(seg)
    expect(evs.length).toBeGreaterThanOrEqual(1)
    expect(evs[0]).toMatch(/Examen práctico/)
    expect(evs[0]).not.toMatch(/%|HETEROEVALUACIÓN/)
  })

  it('evidencias: Total (35) partido en líneas y valores residuales', () => {
    const seg = 'Matriz de evaluación (30) Evidencia de aprendizaje (31) % (32)\nEl lenguaje oculto de la computadora 30% 15 15 Heteroevaluación\nDiagnóstico de un sistema\ncomputacional 35% 15 20 Heteroevaluación\nTotal\n(35)'
    const evs = extraerEvidencias(seg)
    expect(evs.length).toBeGreaterThanOrEqual(2)
    expect(evs[0]).toMatch(/lenguaje oculto/)
    expect(evs[0]).not.toMatch(/15|%|Heteroevaluación/)
    expect(evs.join(' ')).not.toMatch(/Total/)
  })

  it.runIf(hayRef(PDF_CALCULO))('PDF Cálculo: paridad exacta con el DOCX (temas, A–F, descripciones)', async () => {
    const texto = await textoPdfReal(PDF_CALCULO as string)
    const meta = extraerMeta(texto)
    expect(meta.division).toBe('Ingeniería en tecnologías de información y comunicación')
    expect(meta.docente.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2)
    expect(meta.grupo).toBe('1011V')
    expect(meta.periodo).toBe('2026-2')
    expect(meta.clave).toBe('ACF-2301')
    const partes = texto.split(/competencia\s*no\.\s*:?/i).slice(1)
    expect(partes.length).toBe(4)
    // Verdad de referencia del .docx: 15/14/14/12 temas, A–F sin valores.
    const temasEsperados = [15, 14, 14, 12]
    const numeros = partes.map((s, i) => extraerNumeroCompetencia(s, String(i + 1)))
    expect(numeros).toEqual(['1', '2', '3', '4'])
    partes.forEach((seg, i) => {
      const temas = extraerTemas(seg)
      const numerados = temas.filter((l) => /^\d/.test(l))
      expect(numerados.length, `comp ${i + 1} temas`).toBe(temasEsperados[i])
      // Sin mezcla de columnas: ningún tema trae texto de actividades.
      expect(temas.join(' '), `comp ${i + 1} mezcla`).not.toMatch(/Investiga|Explicar|Guiar|Controla la conducta|Precisa la comunicación|Fomentar|Mostrar situaciones/)
      const inds = extraerIndicadores(seg)
      expect(inds.map((x) => x.letra), `comp ${i + 1} letras`).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
      expect(inds.every((x) => x.valor === null), `comp ${i + 1} sin porcentaje`).toBe(true)
      const evs = extraerEvidencias(seg)
      expect(evs.length, `comp ${i + 1} sin evidencias`).toBeGreaterThanOrEqual(1)
    })
    // Descripciones completas (varios renglones unidos).
    expect(partes[0]).not.toBe('')
    const desc0 = partes[0].match(/descripci[oó]n\s*\(?\d*\)?\s*:?\s*([\s\S]+?)(?:temas|actividades|horas|encuadre|desarrollo)/is)?.[1] ?? ''
    expect(desc0.replace(/\s+/g, ' ')).toMatch(/decodificación/)
    expect(desc0.replace(/\s+/g, ' ')).toMatch(/TIC/)
  }, 60000)

  it('descripción no se corta dentro de otra palabra ("sistemas" ≠ "temas")', () => {
    const seg = ' (19) 1 Descripción (20) : Reconoce la importancia de los sistemas numéricos: binario, octal y hexadecimal en las ciencias computacionales. Temas y subtemas para desarrollar la competencia específica (21) 1.1 Tipos de sistemas numéricos. Indicadores de alcance (26)'
    expect(extraerDescripcion(seg).replace(/\s+/g, ' ')).toBe('Reconoce la importancia de los sistemas numéricos: binario, octal y hexadecimal en las ciencias computacionales.')
  })

  it.runIf(hayRef(PDF_DISCRETAS))('PDF Discretas: variantes de formato con datos completos', async () => {
    const texto = await textoPdfReal(PDF_DISCRETAS as string)
    expect(texto).toMatch(/competencia/i)
    expect(texto).toMatch(/TIF-1019/)
    expect(texto).toMatch(/2026-2/)
    const partes = texto.split(/competencia\s*no\.\s*:?/i).slice(1)
    expect(partes.length).toBe(4)
    const numeros = partes.map((s, i) => extraerNumeroCompetencia(s, String(i + 1)))
    expect(numeros).toEqual(['1', '2', '3', '4'])
    // Comp 1: la descripción contiene "sistemas" y no debe cortarse en "temas".
    expect(extraerDescripcion(partes[0]).replace(/\s+/g, ' ')).toBe('Reconoce la importancia de los sistemas numéricos: binario, octal y hexadecimal en las ciencias computacionales.')
    for (const seg of partes) {
      const numero = extraerNumeroCompetencia(seg, '?')
      const inds = extraerIndicadores(seg)
      const evs = extraerEvidencias(seg)
      expect(extraerTemas(seg).length, `comp ${numero} sin temas`).toBeGreaterThan(2)
      expect(inds.length, `comp ${numero} sin indicadores`).toBeGreaterThanOrEqual(3)
      expect(inds.map((i) => i.letra), `comp ${numero} letras`).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
      expect(inds.every((i) => i.valor === null), `comp ${numero} sin porcentaje`).toBe(true)
      expect(evs.length, `comp ${numero} sin evidencias`).toBeGreaterThanOrEqual(1)
      expect(evs.join(' '), `comp ${numero} evidencia sucia`).not.toMatch(/%|Heteroevaluación|Total/)
    }
  }, 60000)

  it.runIf(hayRef(DOCX_ETICA))('DOCX Ética: runs partidos, viñetas sin letra y tablas de evidencias', async () => {
    const buf = readFileSync(DOCX_ETICA as string)
    const mammoth = (await import('mammoth')).default
    const { value: raw } = await mammoth.extractRawText({ buffer: buf })
    const zip = await JSZip.loadAsync(buf)
    const docXml = await zip.file('word/document.xml')!.async('string')
    const meta = extraerMeta(raw)
    const metaT = extraerMetaTablas(docXml)
    for (const k of ['division', 'docente', 'asignatura', 'grupo', 'periodo', 'plan', 'clave'] as const) {
      if (metaT[k]) (meta as Record<string, string>)[k] = metaT[k] as string
    }
    expect(meta.asignatura).toBe('Taller de Ética')
    expect(meta.docente.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2)
    expect(meta.grupo).toBe('1011-V')
    expect(meta.periodo).toBe('2026-2')
    expect(meta.clave).toBe('ACH-2307')
    expect(meta.division).toMatch(/Telecomunicaciones/)
    const { instrumentacion } = construirInstrumentacion({
      texto: raw, meta, nombre: 'etica.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      b64: '', orientacion: 'landscape', filas: filasDeDocx(docXml),
    })
    // 4 competencias reales 1–4; las 8 tablas FO-14 incrustadas no generan basura.
    expect(instrumentacion.competencias.map((c) => c.numero)).toEqual(['1', '2', '3', '4'])
    expect(instrumentacion.necesitaRevision).toBe(false)
    instrumentacion.competencias.forEach((c, i) => {
      expect(c.descripcion.length, `comp ${i + 1} sin descripción`).toBeGreaterThan(20)
      expect(c.temas.length, `comp ${i + 1} sin temas`).toBeGreaterThan(2)
      expect(c.indicadores.map((x) => x.letra), `comp ${i + 1} letras`).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
      expect(c.indicadores.every((x) => x.valor === null), `comp ${i + 1} sin porcentaje`).toBe(true)
      expect(c.evidenciasSugeridas.length, `comp ${i + 1} sin evidencias`).toBeGreaterThanOrEqual(1)
    })
    expect(instrumentacion.competencias[0].descripcion).toMatch(/ideologías/)
    expect(instrumentacion.competencias[0].temas.join(' ')).toMatch(/Generalidades sobre Ética/)
    expect(instrumentacion.competencias[0].temas.join(' ')).not.toMatch(/Actividades de aprendizaje|Evaluar Asignar/)
  }, 60000)
})

describe('extracción estructural por filas (FO-205P11000-44)', () => {
  it('numeroFinal: parentetizado final o dígitos iniciales', () => {
    expect(numeroFinal('1 ,2 ,3 (1)', 'x')).toBe('1')
    expect(numeroFinal('4/ 5 ( 2)', 'x')).toBe('2')
    expect(numeroFinal('6/7 (3)', 'x')).toBe('3')
    expect(numeroFinal('8/9 (4)', 'x')).toBe('4')
    expect(numeroFinal('2.', 'x')).toBe('2')
    expect(numeroFinal('1', 'x')).toBe('1')
    expect(numeroFinal('', 'x')).toBe('x')
  })

  it('trozarTemas: no parte dentro de un número (`1.2.1` intacto)', () => {
    const t = trozarTemas('1.2.1 Respeto y responsabilidad 1.2.2.1 Respeto a la vida')
    expect(t.filter((x) => x.numerado).map((x) => x.texto)).toEqual([
      '1.2.1 Respeto y responsabilidad',
      '1.2.2.1 Respeto a la vida',
    ])
  })

  it('trozarTemas: marca sin espacio y nota en mayúsculas', () => {
    const t = trozarTemas('1.2Panorama general de la contabilidad:')
    expect(t).toHaveLength(1)
    expect(t[0].numerado).toBe(true)
    const nota = trozarTemas('APLICACIÓN DE SEGUNDAS OPORTUNIDADES')
    expect(nota).toHaveLength(1)
    expect(nota[0].suelto).toBe(true)
    expect(trozarTemas('16.67')).toEqual([])
  })

  it('filasDePdf: agrupa por renglón y une runs partidos', () => {
    const filas = filasDePdf([[
      { str: '1.1 Tema', transform: [8, 0, 0, 8, 77, 400], width: 40 },
      { str: 'Actividad', transform: [8, 0, 0, 8, 220, 400], width: 50 },
      { str: 'cont.', transform: [8, 0, 0, 8, 77, 389], width: 25 },
    ]])
    expect(filas).toHaveLength(2)
    expect(filas[0].celdas).toEqual(['1.1 Tema', 'Actividad'])
    expect(filas[1].celdas).toEqual(['cont.'])
  })

  it('competenciasDeFilas: encabezado DOCX, indicador multilínea y niveles fuera', () => {
    const comps = competenciasDeFilas([
      { celdas: ['Competencia No. :(17)', '1 ,2 ,3 (1)', 'Descripción(18):', 'Conoce los números reales'], xs: [], ws: [], ys: [] },
      { celdas: ['Temas y subtemas para desarrollar la competencia', 'Actividades de aprendizaje'], xs: [], ws: [], ys: [] },
      { celdas: ['1.1 Los números reales y sus subconjuntos.'], xs: [], ws: [], ys: [] },
      { celdas: ['Indicadores de alcance (24)', 'Valor del indicador (25)'], xs: [], ws: [], ys: [] },
      { celdas: ['A) Se adapta a situaciones complejas.', '15'], xs: [], ws: [], ys: [] },
      { celdas: ['D) Introduce recursos con criterio', '15'], xs: [], ws: [], ys: [] },
      { celdas: ['Desempeño', 'Nivel de desempeño', 'Indicadores de alcance (27)', 'Valoración numérica (28)'], xs: [], ws: [], ys: [] },
      { celdas: ['Competencia no alcanzada', 'Insuficiente', 'No se cumple con el 100% de evidencias', 'NA'], xs: [], ws: [], ys: [] },
    ])
    expect(comps).toHaveLength(1)
    expect(comps[0].numero).toBe('1')
    expect(comps[0].temas).toEqual(['1.1 Los números reales y sus subconjuntos.'])
    expect(comps[0].indicadores.map((i) => i.letra)).toEqual(['A', 'D'])
    expect(comps[0].indicadores.every((i) => i.valor === null)).toBe(true)
    expect(comps[0].indicadores.join(' ')).not.toMatch(/100%|NA/)
  })

  it('competenciasDeFilas: número de campo suelto y temas sin encabezado previo', () => {
    const comps = competenciasDeFilas([
      { celdas: ['Competencia No. :', '(19)', '2', 'Descripción'], xs: [], ws: [], ys: [] },
      { celdas: ['Temas y subtemas para desarrollar la competencia'], xs: [], ws: [], ys: [] },
      { celdas: ['El sentido de la materia. 2.1 Significado.'], xs: [], ws: [], ys: [] },
      { celdas: ['Temas y subtemas para desarrollar la competencia'], xs: [], ws: [], ys: [] },
      { celdas: ['Otro bloque. 3.1 Siguiente.'], xs: [], ws: [], ys: [] },
    ])
    expect(comps.map((c) => c.numero)).toEqual(['2', '3'])
    expect(comps[1].temas.join(' ')).toMatch(/3\.1 Siguiente/)
  })

  it('competenciasDeFilas: tablas FO-14 al final no generan basura', () => {
    const comps = competenciasDeFilas([
      { celdas: ['Competencia No. :', '1', 'Descripción', 'Aprende ética'], xs: [], ws: [], ys: [] },
      { celdas: ['Temas y subtemas para desarrollar la competencia'], xs: [], ws: [], ys: [] },
      { celdas: ['1.1 Generalidades.'], xs: [], ws: [], ys: [] },
      { celdas: ['División: (1)', 'Ingeniería', 'Grupo: (2)', '1011-V'], xs: [], ws: [], ys: [] },
      { celdas: ['Nombre y número de control: (5)', 'Alguien 123'], xs: [], ws: [], ys: [] },
      { celdas: ['Evidencia de aprendizaje: (10)', 'CUADRO SINÓPTICO'], xs: [], ws: [], ys: [] },
    ])
    expect(comps).toHaveLength(1)
    expect(comps[0].evidenciasSugeridas.join(' ')).not.toMatch(/CUADRO|Alguien/)
  })
})

describe('instrumentación estructural en los 7 documentos', () => {
  async function filasPdfReal(path: string) {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const buf = readFileSync(path)
    const pdf = await getDocument({ data: new Uint8Array(buf) }).promise
    const paginas = []
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      paginas.push((await page.getTextContent()).items)
    }
    return filasDePdf(paginas as never)
  }

  async function compsDocxReal(path: string) {
    const zip = await JSZip.loadAsync(readFileSync(path))
    return competenciasDeFilas(filasDeDocx(await zip.file('word/document.xml')!.async('string')))
  }

  function revisarLimpieza(comps: { numero: string; descripcion: string; temas: string[]; indicadores: { letra: string; descripcion: string; valor: number | null }[]; evidenciasSugeridas: string[] }[], tag: string) {
    for (const c of comps) {
      expect(c.descripcion.length, `${tag} comp ${c.numero} sin descripción`).toBeGreaterThan(20)
      expect(c.indicadores.map((i) => i.letra), `${tag} comp ${c.numero} letras`).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
      expect(c.indicadores.every((i) => i.valor === null), `${tag} comp ${c.numero} con porcentaje`).toBe(true)
      expect(c.indicadores.join(' '), `${tag} comp ${c.numero} indicador sucio`).not.toMatch(/%|\||NA \(No Alcanzada\)|Niveles de desempeño/)
      for (const t of c.temas) {
        expect(t, `${tag} comp ${c.numero} tema con %`).not.toMatch(/%/)
      }
      expect(c.evidenciasSugeridas.join(' '), `${tag} comp ${c.numero} evidencia sucia`).not.toMatch(/%|Heteroevaluación|Total \d|No Alcanzada/)
    }
  }

  it.runIf(hayRef(DOCX_CALCULO))('DOCX Cálculo: 1–4 con 15/14/14/12 temas numerados', async () => {
    const comps = await compsDocxReal(DOCX_CALCULO as string)
    expect(comps.map((c) => c.numero)).toEqual(['1', '2', '3', '4'])
    const numerados = comps.map((c) => c.temas.filter((t) => /^\d/.test(t)).length)
    expect(numerados).toEqual([15, 14, 14, 12])
    expect(comps[0].descripcion).toMatch(/decodificación/)
    expect(comps[0].descripcion).toMatch(/TIC/)
    expect(comps[0].temas.join(' ')).not.toMatch(/Actividades de aprendizaje|Explicar y ejemplificar/)
    revisarLimpieza(comps, 'docx-calculo')
  }, 60000)

  it.runIf(hayRef(DOCX_CALCULO) && hayRef(PDF_CALCULO))('paridad estructural PDF vs DOCX en Cálculo', async () => {
    const a = await compsDocxReal(DOCX_CALCULO as string)
    const b = competenciasDeFilas(await filasPdfReal(PDF_CALCULO as string))
    expect(b.map((c) => c.numero)).toEqual(a.map((c) => c.numero))
    expect(b.map((c) => c.temas.filter((t) => /^\d/.test(t)).length))
      .toEqual(a.map((c) => c.temas.filter((t) => /^\d/.test(t)).length))
    expect(b.map((c) => c.indicadores.map((i) => i.letra))).toEqual(a.map((c) => c.indicadores.map((i) => i.letra)))
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
    expect(norm(b[0].descripcion)).toBe(norm(a[0].descripcion))
  }, 120000)

  it.runIf(hayRef(PDF_DISCRETAS))('PDF Discretas: 1–4 completos y limpios', async () => {
    const comps = competenciasDeFilas(await filasPdfReal(PDF_DISCRETAS as string))
    expect(comps.map((c) => c.numero)).toEqual(['1', '2', '3', '4'])
    expect(comps[0].descripcion.replace(/\s+/g, ' ')).toBe('Reconoce la importancia de los sistemas numéricos: binario, octal y hexadecimal en las ciencias computacionales.')
    expect(comps.map((c) => c.temas.filter((t) => /^\d/.test(t)).length)).toEqual([4, 7, 4, 6])
    expect(comps.map((c) => c.evidenciasSugeridas.length)).toEqual([3, 3, 3, 4])
    expect(comps[0].evidenciasSugeridas.join(' ')).toMatch(/lenguaje oculto/)
    expect(comps.map((c) => c.temas.join(' ')).join(' ')).not.toMatch(/Realiza su Evaluación|Presentación de encuadre|Habilidad de aplicar|Responsabilidad social/)
    revisarLimpieza(comps, 'pdf-discretas')
  }, 120000)

  it.runIf(hayRef(PDF_CONTA))('PDF Conta: 1–4 completos y limpios', async () => {
    const comps = competenciasDeFilas(await filasPdfReal(PDF_CONTA as string))
    expect(comps.map((c) => c.numero)).toEqual(['1', '2', '3', '4'])
    expect(comps[0].temas.filter((t) => t === '1.1.1. Concepto de entidades,')).toHaveLength(1)
    expect(comps[0].evidenciasSugeridas).toContain('Actividad 1. Cuadro Comparativo')
    expect(comps.map((c) => c.temas.join(' ')).join(' ')).not.toMatch(/Actividad \d|Investiga el concepto|Realiza una exposición|Practica en equipo|Examen de conocimientos/)
    revisarLimpieza(comps, 'pdf-conta')
  }, 120000)

  it.runIf(hayRef(PDF_ADMIN))('PDF Administración: 1–5 completos y limpios', async () => {
    const filas = await filasPdfReal(PDF_ADMIN as string)
    const meta = extraerMetaDeFilas(filas)
    expect(meta.grupo).toBe('1011-V')
    expect(meta.periodo).toBe('2026-2')
    expect(meta.clave).toBe('TIC-1002')
    expect(meta.docente?.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2)
    expect(meta.asignatura?.trim().length).toBeGreaterThan(3)
    const comps = competenciasDeFilas(filas)
    expect(comps.map((c) => c.numero)).toEqual(['1', '2', '3', '4', '5'])
    expect(comps[0].temas.join(' ')).toMatch(/1\.1 Definición de administración/)
    // comp 1 no arrastra la fila administrativa de encuadre
    expect(comps[0].temas.join(' ')).not.toMatch(/Encuadre de la materia/)
    // comp 2 sin columnas vecinas pegadas
    expect(comps[1].temas.join(' ')).not.toMatch(/Organizar y aplicar/)
    expect(comps[1].temas.join(' ')).not.toMatch(/Calificar las evidencias/)
    // números no partidos
    expect(comps.map((c) => c.evidenciasSugeridas.join(' ')).join(' ')).not.toMatch(/clase 1 7/)
    expect(comps.map((c) => c.temas.join(' ')).join(' ')).not.toMatch(/Test Final|%/)
    revisarLimpieza(comps, 'pdf-admin')
  }, 120000)

  it.runIf(hayRef(PDF_FUND))('PDF Fundamentos: 1–5 completos y limpios', async () => {
    const comps = competenciasDeFilas(await filasPdfReal(PDF_FUND as string))
    expect(comps.map((c) => c.numero)).toEqual(['1', '2', '3', '4', '5'])
    expect(comps[0].descripcion.replace(/\s+/g, ' ')).toMatch(/^Comprende los conceptos/)
    expect(comps.every((c) => c.descripcion.length > 20)).toBe(true)
    expect(comps[0].evidenciasSugeridas).toContain('Exposición en clase')
    expect(comps[0].evidenciasSugeridas).toContain('Portafolio de evidencias')
    expect(comps.map((c) => c.temas.join(' ')).join(' ')).not.toMatch(/Realiza la evaluación|muestra el SGI|Habilidades de gestión/)
    expect(comps.map((c) => c.evidenciasSugeridas.join(' ')).join(' ')).not.toMatch(/A B C|%|Total/)
    revisarLimpieza(comps, 'pdf-fund')
  }, 120000)
})

describe('visor pdf adaptativo', () => {
  it('usa visor propio en táctil con puntero grueso o UA móvil', async () => {
    const { debeUsarVisorPropio } = await import('../src/ui/PdfVista')
    expect(debeUsarVisorPropio(true, true, false)).toBe(true)
    expect(debeUsarVisorPropio(false, true, true)).toBe(true)
    expect(debeUsarVisorPropio(false, false, false)).toBe(false)
    expect(debeUsarVisorPropio(true, false, false)).toBe(false)
  })
})

describe('orden libre del portafolio (portada fija)', () => {
  async function helpers() {
    return import('../src/domain/types')
  }
  const secs = () => [
    { id: 'p', tipo: 'portada', titulo: 'Portada', grupo: 'portada' },
    { id: 'i', tipo: 'indice', titulo: 'Índice', grupo: 'indice' },
    { id: 'n', tipo: 'instrumentacion', titulo: 'Instrumentación', grupo: 'instrumentacion' },
    { id: 'e', tipo: 'evidencia', titulo: 'Evidencia', refId: 'imp1', grupo: 'contenido' },
  ] as never

  it('la portada no se mueve ni cede el puesto 0', async () => {
    const { moverSeccion } = await helpers()
    expect(moverSeccion(secs(), 'p', 1)[0].id).toBe('p')
    expect(moverSeccion(secs(), 'i', -1)[0].id).toBe('p')
    expect(moverSeccion(secs(), 'n', -2)[0].id).toBe('p')
  })
  it('el resto se reordena libre entre bloques', async () => {
    const { moverSeccion } = await helpers()
    const r = moverSeccion(secs(), 'n', -1)
    expect(r.map((s) => s.id)).toEqual(['p', 'n', 'i', 'e'])
  })
  it('presets: índice o instrumentación al final', async () => {
    const { aplicarPresetOrden } = await helpers()
    expect(aplicarPresetOrden(secs(), 'indice-final').map((s) => s.id)).toEqual(['p', 'n', 'e', 'i'])
    expect(aplicarPresetOrden(secs(), 'instrumentacion-final').map((s) => s.id)).toEqual(['p', 'i', 'e', 'n'])
    expect(aplicarPresetOrden(secs(), 'institucional').map((s) => s.id)).toEqual(['p', 'i', 'n', 'e'])
  })
  it('el PDF inserta el índice donde va (al final)', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const src = await PDFDocument.create()
    src.addPage([300, 400])
    const pdfBase64 = Buffer.from(await src.save()).toString('base64')
    const { ensamblarPortafolio } = await import('../src/infrastructure/portfolioPdf')
    const ev = { ...base, id: 'imp1', origen: 'pdf' as const, nombreEvidencia: 'Reporte previo', competenciaNo: '2', pdfBase64, pdfPaginas: 1, bloques: [], indicadoresSeleccionados: [] }
    const out = await ensamblarPortafolio(
      {
        id: 'p1', asignaturaId: 'a1', titulo: 'Portafolio', creadaEn: 1,
        secciones: [
          { id: 's1', tipo: 'portada', titulo: 'Portada', grupo: 'portada' },
          { id: 's3', tipo: 'evidencia', titulo: 'Reporte previo', refId: 'imp1', grupo: 'contenido' },
          { id: 's2', tipo: 'indice', titulo: 'Índice', grupo: 'indice' },
        ],
      },
      [ev], null, [],
      { asignatura: 'Cálculo', division: 'Div', alumno: 'A 1', docente: 'Doc', grupo: 'G', periodo: 'P' },
    )
    const doc = await PDFDocument.load(out)
    // portada + 1 importada + 1 de índice al final
    expect(doc.getPageCount()).toBe(3)
  })
  it('sin sección de índice no se inserta página de índice', async () => {
    const { PDFDocument } = await import('pdf-lib')
    const src = await PDFDocument.create()
    src.addPage([300, 400])
    const pdfBase64 = Buffer.from(await src.save()).toString('base64')
    const { ensamblarPortafolio } = await import('../src/infrastructure/portfolioPdf')
    const ev = { ...base, id: 'imp1', origen: 'pdf' as const, nombreEvidencia: 'Reporte previo', competenciaNo: '2', pdfBase64, pdfPaginas: 1, bloques: [], indicadoresSeleccionados: [] }
    const out = await ensamblarPortafolio(
      {
        id: 'p1', asignaturaId: 'a1', titulo: 'Portafolio', creadaEn: 1,
        secciones: [
          { id: 's1', tipo: 'portada', titulo: 'Portada', grupo: 'portada' },
          { id: 's3', tipo: 'evidencia', titulo: 'Reporte previo', refId: 'imp1', grupo: 'contenido' },
        ],
      },
      [ev], null, [],
      { asignatura: 'Cálculo', division: 'Div', alumno: 'A 1', docente: 'Doc', grupo: 'G', periodo: 'P' },
    )
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2)
  })
})

describe('polyfill Promise.withResolvers (pdf.js en Safari < 17.4)', () => {
  it('no pisa una implementación existente', async () => {
    const { asegurarPolyfillsPdf } = await import('../src/infrastructure/pdfCompat')
    const original = Promise.withResolvers
    asegurarPolyfillsPdf()
    expect(Promise.withResolvers).toBe(original)
  })
  it('funciona cuando se elimina', async () => {
    const { asegurarPolyfillsPdf } = await import('../src/infrastructure/pdfCompat')
    const original = Promise.withResolvers
    // @ts-expect-error simulación de Safari viejo
    delete (Promise as { withResolvers?: unknown }).withResolvers
    asegurarPolyfillsPdf()
    const r = Promise.withResolvers<number>()
    expect(typeof r.resolve).toBe('function')
    expect(typeof r.reject).toBe('function')
    r.resolve(42)
    expect(await r.promise).toBe(42)
    // restaurar
    ;(Promise as { withResolvers?: unknown }).withResolvers = original
  })
})
