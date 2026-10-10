// Infrastructure: persistencia local (Dexie IndexedDB + LocalStorage perfil).
import Dexie, { type Table } from 'dexie'
import type { Alumno, Evidencia, Instrumentacion, Portafolio } from '../domain/types'

export interface AsignaturaMeta {
  id: string
  nombre: string
  docente: string
  grupo: string
  periodo: string
  instrumentacionId?: string
  creadaEn: number
}

class RinoDB extends Dexie {
  asignaturas!: Table<AsignaturaMeta, string>
  instrumentaciones!: Table<Instrumentacion, string>
  evidencias!: Table<Evidencia, string>
  portafolios!: Table<Portafolio, string>

  constructor() {
    super('rino-docs')
    this.version(1).stores({
      asignaturas: 'id, nombre',
      instrumentaciones: 'id, asignatura',
      evidencias: 'id, asignaturaId',
      portafolios: 'id, asignaturaId',
    })
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
