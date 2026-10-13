// Normalización de registros anteriores al esquema actual.
// Se aplica al leer y se re-guarda normalizado.

import { grupoDe, type BloqueContenido, type Evidencia, type PortafolioSeccion } from './types'

export function normalizarEvidencia(e: Evidencia): Evidencia {
  const bloques: BloqueContenido[] = (e.bloques ?? []).map((b) => {
    if (b.tipo === 'imagen') {
      const img = b as Partial<Extract<BloqueContenido, { tipo: 'imagen' }>> & { id: string; dataUrl: string }
      return {
        id: img.id, tipo: 'imagen' as const, dataUrl: img.dataUrl ?? '',
        pie: img.pie, anchoOriginal: img.anchoOriginal ?? 0, altoOriginal: img.altoOriginal ?? 0,
        anchoPct: img.anchoPct ?? 100, escala: img.escala ?? 1,
      }
    }
    if (b.tipo === 'codigo') {
      const c = b as Partial<Extract<BloqueContenido, { tipo: 'codigo' }>> & { id: string; texto: string }
      return { id: c.id, tipo: 'codigo' as const, lenguaje: c.lenguaje ?? 'texto', texto: c.texto ?? '' }
    }
    return b
  })
  return {
    ...e,
    integrantes: Array.isArray(e.integrantes) ? e.integrantes : [],
    bloques,
    creadaEn: e.creadaEn ?? Date.now(),
    actualizadaEn: e.actualizadaEn ?? Date.now(),
  }
}

export function normalizarSeccion(s: PortafolioSeccion): PortafolioSeccion {
  return { ...s, grupo: s.grupo ?? grupoDe(s.tipo) }
}

export function necesitaMigracionEvidencia(e: Evidencia): boolean {
  if (!Array.isArray(e.integrantes)) return true
  if (!Array.isArray(e.bloques)) return true
  return e.bloques.some((b) => b.tipo === 'imagen' && ((b as Partial<typeof b>).anchoPct === undefined))
}
