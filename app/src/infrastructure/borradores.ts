// Borradores del editor de evidencias (autosave).
// Tabla propia: no aparecen en la lista ni en el portafolio.
// Caducan a los 15 días sin guardar.

import { db, type BorradorEvidencia } from './db'
import type { Evidencia } from '../domain/types'

/** 15 días en ms. */
export const BORRADOR_MS = 15 * 24 * 3600 * 1000
/** Clave del borrador al crear (sin id de evidencia aún). */
export const BORRADOR_NUEVA = 'nueva'

export function borradorExpirado(actualizadaEn: number, ahora = Date.now()): boolean {
  return ahora - actualizadaEn > BORRADOR_MS
}

/** ¿Vale la pena guardar? Evita borradores de formularios intactos. */
export function borradorConContenido(ev: Evidencia): boolean {
  return !!(
    ev.nombreEvidencia.trim() ||
    ev.competenciaNo.trim() ||
    ev.descripcionCompetencia.trim() ||
    ev.indicadoresSeleccionados.length > 0 ||
    ev.bloques.length > 0 ||
    ev.integrantes.length > 0
  )
}

/** Texto corto de antigüedad ("hace 2 h", "hace 3 días") para el aviso. */
export function haceCuanto(actualizadaEn: number, ahora = Date.now()): string {
  const min = Math.max(1, Math.round((ahora - actualizadaEn) / 60000))
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'ayer' : `hace ${d} días`
}

/** Cuánto falta para que caduque ("se elimina en 14 días / mañana / hoy"). */
export function expiraEn(actualizadaEn: number, ahora = Date.now()): string {
  const resta = actualizadaEn + BORRADOR_MS - ahora
  if (resta <= 0) return 'hoy'
  const d = Math.floor(resta / 86400000)
  if (d >= 2) return `en ${d} días`
  if (d === 1) return 'mañana'
  const h = Math.floor(resta / 3600000)
  if (h >= 1) return `en ${h} h`
  return 'hoy'
}

export async function guardarBorrador(id: string, asignaturaId: string, evidencia: Evidencia): Promise<void> {
  const b: BorradorEvidencia = { id, asignaturaId, evidencia, actualizadaEn: Date.now() }
  await db.borradores.put(b)
}

export async function cargarBorrador(id: string): Promise<BorradorEvidencia | undefined> {
  try {
    const b = await db.borradores.get(id)
    if (!b || borradorExpirado(b.actualizadaEn)) {
      if (b) await db.borradores.delete(id)
      return undefined
    }
    return b
  } catch {
    return undefined
  }
}

export async function descartarBorrador(id: string): Promise<void> {
  try {
    await db.borradores.delete(id)
  } catch { /* noop */ }
}

/** Retomar un borrador: reinicia su contador de 15 días al abrirlo. */
export async function retomarBorrador(id: string): Promise<BorradorEvidencia | undefined> {
  const b = await cargarBorrador(id)
  if (!b) return undefined
  const tocado: BorradorEvidencia = { ...b, actualizadaEn: Date.now() }
  try {
    await db.borradores.put(tocado)
  } catch { /* noop */ }
  return tocado
}

/** Todos los borradores vigentes (más recientes primero), purgando vencidos. */
export async function listarBorradores(): Promise<BorradorEvidencia[]> {
  try {
    await limpiarBorradores()
    const todos = await db.borradores.toArray()
    return todos
      .filter((b) => !borradorExpirado(b.actualizadaEn))
      .sort((a, b) => b.actualizadaEn - a.actualizadaEn)
  } catch {
    return []
  }
}

/** Purga borradores vencidos (al abrir la app / el editor). */
export async function limpiarBorradores(): Promise<number> {
  try {
    const viejos = await db.borradores.where('actualizadaEn').below(Date.now() - BORRADOR_MS).primaryKeys()
    if (viejos.length) await db.borradores.bulkDelete(viejos)
    return viejos.length
  } catch {
    return 0
  }
}
