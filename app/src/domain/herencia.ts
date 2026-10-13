// Herencia de datos materia/perfil hacia la evidencia (FO-205P11000-14).
// Funciones puras: la lista de materias se carga de forma asíncrona.

import type { Alumno, Evidencia } from './types'

/** Mínimo necesario de la materia (estructuralmente compatible con AsignaturaMeta). */
export interface MateriaBase {
  id: string
  nombre: string
  docente: string
  grupo: string
}

/** Elige materia válida: la actual si existe, si no la primera, si no ''. */
export function elegirMateriaDefault(asignaturas: Pick<MateriaBase, 'id'>[], asigId: string): string {
  if (asigId && asignaturas.some((a) => a.id === asigId)) return asigId
  return asignaturas[0]?.id ?? ''
}

/** Hereda campos de materia y perfil; solo rellena los vacíos. */
export function aplicarHerencia(ev: Evidencia, asig: MateriaBase | null | undefined, perfil: Alumno): Evidencia {
  if (!asig) return ev
  return {
    ...ev,
    asignaturaId: ev.asignaturaId || asig.id,
    asignatura: ev.asignatura || asig.nombre,
    docente: ev.docente || asig.docente,
    grupo: ev.grupo || asig.grupo || perfil.grupo,
    division: ev.division || perfil.division,
    alumnoNombre: ev.alumnoNombre || perfil.nombreCompleto,
    numeroControl: ev.numeroControl || perfil.numeroControl,
  }
}

/** Indica si aplicarHerencia cambiaría algo. */
export function herenciaPendiente(ev: Evidencia, asig: MateriaBase | null | undefined, perfil: Alumno): boolean {
  if (!asig) return false
  const n = aplicarHerencia(ev, asig, perfil)
  return (
    n.asignaturaId !== ev.asignaturaId || n.asignatura !== ev.asignatura ||
    n.docente !== ev.docente || n.grupo !== ev.grupo || n.division !== ev.division ||
    n.alumnoNombre !== ev.alumnoNombre || n.numeroControl !== ev.numeroControl
  )
}
