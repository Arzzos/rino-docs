// Domain — entidades puras, sin imports de frameworks.
// Reglas TESCI: FO-205P11000-14 (10 campos) y FO-205P11000-44 (instrumentación).

export interface Alumno {
  nombreCompleto: string
  numeroControl: string
  division: string
  grupo: string
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
  necesitaRevision: boolean
  parseConfianza: number // 0..1
  creadaEn: number
}

export type BloqueContenido =
  | { id: string; tipo: 'texto'; texto: string }
  | { id: string; tipo: 'codigo'; lenguaje: string; texto: string }
  | { id: string; tipo: 'tabla'; encabezados: string[]; filas: string[][] }
  | { id: string; tipo: 'imagen'; dataUrl: string; pie?: string; anchoOriginal: number; altoOriginal: number }
  | { id: string; tipo: 'referencia'; texto: string; url?: string }

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
  fechaEntrega: string
  competenciaNo: string
  descripcionCompetencia: string
  indicadoresSeleccionados: string[] // letras
  nombreEvidencia: string
  bloques: BloqueContenido[]
  creadaEn: number
  actualizadaEn: number
}

export interface PortafolioSeccion {
  id: string
  tipo: 'portada' | 'indice' | 'instrumentacion' | 'portada-competencia' | 'evidencia'
  titulo: string
  refId?: string // competencia.numero o evidencia.id
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
  'Ingeniería Industrial',
  'Ingeniería en Sistemas Computacionales',
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
  if (e.bloques.length === 0) errores.push('Agrega al menos un bloque de contenido')
  return errores
}

export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
