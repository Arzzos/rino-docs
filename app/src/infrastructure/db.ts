// Persistencia local (Dexie IndexedDB + LocalStorage para el perfil).
import Dexie, { type Table } from 'dexie'
import type { Alumno, Diagnostica, Evidencia, Instrumentacion, Portafolio } from '../domain/types'

export interface AsignaturaMeta {
  id: string
  nombre: string
  docente: string
  grupo: string
  periodo: string
  instrumentacionId?: string
  creadaEn: number
}

/**
 * Borrador de evidencia (autosave del editor). Tabla propia, separada de
 * las evidencias guardadas. Caduca a los 15 días sin guardar.
 */
export interface BorradorEvidencia {
  /** 'nueva' al crear, o el id de la evidencia al editar. */
  id: string
  asignaturaId: string
  evidencia: Evidencia
  actualizadaEn: number
}

class RinoDB extends Dexie {
  asignaturas!: Table<AsignaturaMeta, string>
  instrumentaciones!: Table<Instrumentacion, string>
  evidencias!: Table<Evidencia, string>
  portafolios!: Table<Portafolio, string>
  diagnosticas!: Table<Diagnostica, string>
  borradores!: Table<BorradorEvidencia, string>

  constructor() {
    super('rino-docs')
    this.version(1).stores({
      asignaturas: 'id, nombre',
      instrumentaciones: 'id, asignatura',
      evidencias: 'id, asignaturaId',
      portafolios: 'id, asignaturaId',
    })
    this.version(2).stores({
      asignaturas: 'id, nombre',
      instrumentaciones: 'id, asignatura',
      evidencias: 'id, asignaturaId',
      portafolios: 'id, asignaturaId',
      diagnosticas: 'id, asignaturaId',
    }).upgrade(() => undefined)
    this.version(3).stores({
      asignaturas: 'id, nombre',
      instrumentaciones: 'id, asignatura',
      evidencias: 'id, asignaturaId',
      portafolios: 'id, asignaturaId',
      diagnosticas: 'id, asignaturaId',
      borradores: 'id, actualizadaEn',
    }).upgrade(() => undefined)
  }
}

export const db = new RinoDB()

const PERFIL_KEY = 'rino.perfil.v1'

export const PerfilRepo = {
  cargar(): Alumno {
    try {
      const raw = localStorage.getItem(PERFIL_KEY)
      if (raw) return JSON.parse(raw) as Alumno
    } catch { /* noop */ }
    return { nombreCompleto: '', numeroControl: '', division: 'Ingeniería en Tecnologías de la Información y Comunicaciones', grupo: '1011V' }
  },
  guardar(p: Alumno) {
    localStorage.setItem(PERFIL_KEY, JSON.stringify(p))
  },
}
