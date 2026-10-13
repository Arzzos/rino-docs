// Entidades puras del dominio (sin frameworks).
// FO-205P11000-14 (10 campos) y FO-205P11000-44 (instrumentación).

export interface Alumno {
  nombreCompleto: string
  numeroControl: string
  division: string
  grupo: string
}

/** Integrante extra de equipo (manual por evidencia, campo 5). */
export interface Integrante {
  nombre: string
  control: string
}

export interface IndicadorAlcance {
  letra: string // A..Z (normalmente A-F, tolerar más/menos)
  descripcion: string
  valor: number | null
}

export interface Competencia {
  numero: string // "1", "4/5", "1,2,3"
  descripcion: string
  temas: string[]
  indicadores: IndicadorAlcance[]
  evidenciasSugeridas: string[]
}

export interface Instrumentacion {
  id: string
  asignatura: string
  docente: string
  grupo: string
  periodo: string
  division: string
  planEstudios?: string
  clave?: string
  competencias: Competencia[]
  /** Bytes originales para incrustar en portafolio */
  originalNombre: string
  originalMime: string
  originalBytesBase64: string
  originalOrientacion: 'portrait' | 'landscape'
  /** PDF convertido del DOCX al cargarlo. */
  pdfBytesBase64?: string
  pdfPaginas?: number
  necesitaRevision: boolean
  parseConfianza: number // 0..1
  creadaEn: number
}

/** Evaluación diagnóstica: independiente de competencia, general por materia. */
export interface Diagnostica {
  id: string
  asignaturaId: string
  nombreHoja: string // ej. "Examen diagnóstico"
  imagenDataUrl: string
  ancho: number
  alto: number
  escala: number // 0.25..1 ajuste manual
  creadaEn: number
}

export type BloqueContenido =
  | { id: string; tipo: 'texto'; texto: string }
  | { id: string; tipo: 'subtitulo'; texto: string }
  | { id: string; tipo: 'salto' }
  | { id: string; tipo: 'codigo'; lenguaje: LenguajeCodigo; texto: string }
  | { id: string; tipo: 'tabla'; encabezados: string[]; filas: string[][] }
  | { id: string; tipo: 'imagen'; dataUrl: string; pie?: string; anchoOriginal: number; altoOriginal: number; anchoPct: number; escala: number }
  | { id: string; tipo: 'referencia'; texto: string; url?: string }

export type LenguajeCodigo = 'python' | 'java' | 'c' | 'sql' | 'texto'

export const LENGUAJES_CODIGO: { id: LenguajeCodigo; label: string }[] = [
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'c', label: 'C' },
  { id: 'sql', label: 'SQL' },
  { id: 'texto', label: 'Texto plano' },
]

export interface Evidencia {
  id: string
  asignaturaId: string
  // Campos FO-205P11000-14 (1..10)
  division: string
  grupo: string
  asignatura: string
  docente: string
  alumnoNombre: string
  numeroControl: string
  /** Equipo extra: se capturan manualmente por evidencia (no todas son en equipo). */
  integrantes: Integrante[]
  fechaEntrega: string
  competenciaNo: string
  descripcionCompetencia: string
  indicadoresSeleccionados: string[] // letras
  nombreEvidencia: string
  bloques: BloqueContenido[]
  creadaEn: number
  actualizadaEn: number
}

export type GrupoSeccion = 'portada' | 'indice' | 'instrumentacion' | 'diagnostica' | 'contenido'

export interface PortafolioSeccion {
  id: string
  tipo: 'portada' | 'indice' | 'instrumentacion' | 'diagnostica' | 'portada-competencia' | 'evidencia'
  titulo: string
  refId?: string // competencia.numero | evidencia.id | diagnostica.id
  grupo: GrupoSeccion
}

/** Orden fijo de grupos; dentro de cada grupo el usuario ordena libremente. */
export const ORDEN_GRUPOS: GrupoSeccion[] = ['portada', 'indice', 'instrumentacion', 'diagnostica', 'contenido']

export function grupoDe(tipo: PortafolioSeccion['tipo']): GrupoSeccion {
  if (tipo === 'portada' || tipo === 'indice' || tipo === 'instrumentacion' || tipo === 'diagnostica') return tipo
  return 'contenido'
}

export interface Portafolio {
  id: string
  asignaturaId: string
  titulo: string
  secciones: PortafolioSeccion[]
  creadaEn: number
}

export const DIVISIONES_TESCI = [
  'Ingeniería en Tecnologías de la Información y Comunicaciones',
  'Ingeniería en Sistemas Computacionales',
  'Ingeniería Industrial',
  'Ingeniería Mecatrónica',
  'Ingeniería Química',
  'Licenciatura en Administración',
  'Contador Público',
] as const

export function validarEvidencia(e: Evidencia): string[] {
  const errores: string[] = []
  if (!e.division.trim()) errores.push('División (1) requerida')
  if (!e.grupo.trim()) errores.push('Grupo (2) requerido')
  if (!e.asignatura.trim()) errores.push('Asignatura (3) requerida')
  if (!e.docente.trim()) errores.push('Docente (4) requerido')
  if (!e.alumnoNombre.trim() || !e.numeroControl.trim()) errores.push('Nombre y número de control (5) requeridos')
  if (!e.fechaEntrega.trim()) errores.push('Fecha de entrega (6) requerida')
  if (!e.competenciaNo.trim()) errores.push('Competencia No. (7) requerida')
  if (!e.descripcionCompetencia.trim()) errores.push('Descripción (8) requerida')
  if (e.indicadoresSeleccionados.length === 0) errores.push('Indicador de alcance (9): selecciona al menos uno')
  if (!e.nombreEvidencia.trim()) errores.push('Evidencia de aprendizaje (10) requerida')
  if (e.bloques.filter((b) => b.tipo !== 'salto').length === 0) errores.push('Agrega al menos un bloque de contenido')
  return errores
}

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
