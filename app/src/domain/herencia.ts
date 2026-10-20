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

/** Competencia mínima para re-derivar (7), (8) y (9) desde la instrumentación. */
export interface CompetenciaMinima {
  numero: string
  descripcion: string
  indicadores: { letra: string; descripcion: string }[]
}

/**
 * Materia con la que se abre el editor.
 * - `guardada`: la de la evidencia que se edita (si existe). Si ya no está en
 *   la lista, se devuelve '' para no re-apuntar la evidencia a otra materia.
 * - `heredada`: la materia filtrada en la sección de evidencias.
 * - Sin ninguna válida: '' (el estudiante debe elegir; nunca se elige sola).
 */
export function resolverMateriaInicial(
  asignaturas: Pick<MateriaBase, 'id'>[],
  guardada: string,
  heredada: string,
): string {
  if (guardada) return asignaturas.some((a) => a.id === guardada) ? guardada : ''
  if (heredada && asignaturas.some((a) => a.id === heredada)) return heredada
  return ''
}

/**
 * Materia de una evidencia guardada. Los registros antiguos pueden no tener
 * `asignaturaId`; en ese caso se busca por el nombre capturado en (3).
 */
export function resolverMateriaGuardada(
  asignaturas: Pick<MateriaBase, 'id' | 'nombre'>[],
  guardada: string,
  nombre: string,
): string {
  if (guardada && asignaturas.some((a) => a.id === guardada)) return guardada
  if (!nombre.trim()) return ''
  const porNombre = asignaturas.find((a) => a.nombre.trim() === nombre.trim())
  return porNombre?.id ?? ''
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

/** Ajuste manual de un campo heredado, ligado a la materia en que se capturó. */
export interface AjusteManual {
  valor: string
  materiaId: string
}

/** Ajustes manuales de los campos que la materia impone: (2) grupo y (4) docente. */
export interface AjustesManuales {
  grupo?: AjusteManual
  docente?: AjusteManual
}

/**
 * Cambio explícito de materia: la nueva materia manda en (2) grupo, (3)
 * asignatura y (4) docente. Es la única vía que pisa esos campos (la
 * herencia solo rellena vacíos) para que la tabla de datos corresponda
 * siempre a una sola materia. Un ajuste manual solo sobrevive mientras
 * siga siendo su materia.
 */
export function aplicarMateria(
  ev: Evidencia,
  asig: MateriaBase | null | undefined,
  perfil: Alumno,
  ajustes?: AjustesManuales,
): Evidencia {
  if (!asig) return ev
  const propio = (a?: AjusteManual) => (a && a.materiaId === asig.id ? a.valor : '')
  return {
    ...ev,
    asignaturaId: asig.id,
    asignatura: asig.nombre,
    docente: propio(ajustes?.docente) || asig.docente,
    grupo: propio(ajustes?.grupo) || asig.grupo || perfil.grupo,
  }
}

/**
 * Re-deriva (7) competencia, (8) descripción y (9) indicadores desde la
 * instrumentación de la materia activa. Si la competencia ya no existe en
 * esa instrumentación, se limpia para no imprimir datos de otra materia.
 */
export function rederivarCompetencia(
  ev: Evidencia,
  competencias: CompetenciaMinima[] | null | undefined,
): Evidencia {
  const comp = competencias?.find((c) => c.numero === ev.competenciaNo)
  if (!comp) {
    if (!ev.competenciaNo && !ev.descripcionCompetencia && !ev.indicadoresSeleccionados.length) return ev
    return { ...ev, competenciaNo: '', descripcionCompetencia: '', indicadoresSeleccionados: [] }
  }
  return {
    ...ev,
    competenciaNo: comp.numero,
    descripcionCompetencia: comp.descripcion,
    indicadoresSeleccionados: comp.indicadores.map((i) => i.letra),
  }
}
