// Términos de uso y aviso de privacidad (texto y versionado).
// Al cambiar el texto, subir VERSION para pedir aceptación de nuevo.

/** Versión vigente. Formato fecha + revisión. */
export const TERMINOS_VERSION = '2026-10-17-v2'

/** Fecha legible de la última actualización. */
export const TERMINOS_FECHA = '17 de octubre de 2026'

/** Clave de LocalStorage donde se guarda la versión aceptada. */
export const TERMINOS_CLAVE = 'rino.terminos.v1'

/** Repositorio público del código fuente. */
export const REPO_URL = 'https://github.com/Arzzos/rino-docs'

export interface SeccionLegal {
  id: string
  titulo: string
}

/** Índice de secciones del documento (el contenido vive en ui/Terminos). */
export const SECCIONES_LEGALES: SeccionLegal[] = [
  { id: 'aceptacion', titulo: '1. Aceptación de los términos' },
  { id: 'servicio', titulo: '2. Descripción del servicio' },
  { id: 'tesci', titulo: '3. Relación con el TESCI' },
  { id: 'privacidad', titulo: '4. Funcionamiento local y aviso de privacidad' },
  { id: 'contenido', titulo: '5. Responsabilidad sobre el contenido' },
  { id: 'exencion', titulo: '6. Limitación de responsabilidad' },
  { id: 'propiedad', titulo: '7. Propiedad intelectual y código abierto' },
  { id: 'cambios', titulo: '8. Modificaciones de la aplicación y los términos' },
  { id: 'contacto', titulo: '9. Contacto' },
]

/** ¿El valor guardado corresponde a la versión vigente? */
export function aceptacionVigente(valor: string | null): boolean {
  return valor === TERMINOS_VERSION
}

/** Lee la versión aceptada (null si nunca se aceptó o falla el acceso). */
export function leerAceptacion(): string | null {
  try {
    return localStorage.getItem(TERMINOS_CLAVE)
  } catch {
    return null
  }
}

/** Guarda la aceptación de la versión vigente con fecha. */
export function guardarAceptacion(): void {
  try {
    localStorage.setItem(TERMINOS_CLAVE, TERMINOS_VERSION)
    localStorage.setItem(`${TERMINOS_CLAVE}.fecha`, new Date().toISOString())
  } catch {
    /* sin almacenamiento no se puede registrar; el aviso reaparece */
  }
}
