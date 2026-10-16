import { useEffect } from 'react'
import { REPO_URL, SECCIONES_LEGALES, TERMINOS_FECHA } from '../domain/legal'
import Icon, { MarcaRD } from './icons'

/** Documento completo de términos y aviso de privacidad. */
export function ContenidoLegal() {
  return (
    <article className="grid gap-4 text-sm leading-relaxed">
      <p className="t-muted">Última actualización: {TERMINOS_FECHA}</p>
      <nav aria-label="Índice del documento" className="rounded-xl t-inset p-3 text-[13px]">
        <ol className="grid gap-1">
          {SECCIONES_LEGALES.map((s) => (
            <li key={s.id}><a href={`#legal-${s.id}`} className="hover:text-[var(--accent)]">{s.titulo}</a></li>
          ))}
        </ol>
      </nav>

      <section id="legal-aceptacion" className="grid gap-1">
        <h4 className="font-bold">1. Aceptación de los términos</h4>
        <p>Al acceder o utilizar RinoDocs aceptas estos Términos de uso y el Aviso de privacidad. Si no estás de acuerdo, puedes dejar de usar la aplicación en cualquier momento; basta con no abrirla y, si lo deseas, borrar sus datos locales desde los ajustes de tu navegador.</p>
      </section>

      <section id="legal-servicio" className="grid gap-1">
        <h4 className="font-bold">2. Descripción del servicio</h4>
        <p>RinoDocs es una herramienta gratuita y de código abierto, desarrollada de manera independiente por un estudiante. Su único propósito es auxiliar a la comunidad estudiantil en la maquetación y generación estandarizada de portafolios y formatos de entrega de evidencias (FO-205P11000-14 e instrumentaciones FO-205P11000-44).</p>
        <p>Se ofrece tal cual, sin garantías de disponibilidad permanente ni de compatibilidad con futuros cambios de formatos institucionales.</p>
      </section>

      <section id="legal-tesci" className="grid gap-1">
        <h4 className="font-bold">3. Relación con el TESCI</h4>
        <p>RinoDocs no está afiliada, respaldada ni oficialmente patrocinada por la administración del Tecnológico de Estudios Superiores de Cuautitlán Izcalli (TESCI). Es un proyecto de la comunidad para la comunidad.</p>
        <p>Las menciones al TESCI y a sus formatos se hacen solo para identificar compatibilidad. Los nombres, marcas y logotipos institucionales pertenecen a sus titulares.</p>
      </section>

      <section id="legal-privacidad" className="grid gap-1">
        <h4 className="font-bold">4. Funcionamiento local y aviso de privacidad</h4>
        <p>RinoDocs procesa toda la información (datos del estudiante, materias, imágenes y documentos de instrumentación) directamente en tu dispositivo, mediante almacenamiento local del navegador (LocalStorage e IndexedDB). No se transmiten, almacenan ni procesan datos personales o académicos en servidores externos ni bases de datos de terceros.</p>
        <p>A futuro podría ofrecerse un servicio opcional de respaldo o trabajo colaborativo en línea; de implementarse, será voluntario y pedirá tu consentimiento por separado antes de enviar cualquier dato fuera de tu dispositivo.</p>
        <p>Eres el único responsable de respaldar tu información. Si borras los datos del navegador, desinstalas la aplicación o cambias de dispositivo sin respaldo, tu información se pierde y no hay manera de recuperarla.</p>
        <p>Sobre datos de otras personas (por ejemplo, integrantes de equipo): solo captúralos con su consentimiento y únicamente para el fin del documento académico.</p>
        <p className="text-[13px] t-muted">Nota conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP): al no haber transmisión ni tratamiento por terceros, tus datos permanecen bajo tu control. Tus derechos ARCO los ejerces directamente: accedes, rectificas, cancelas u opones borrando o editando tu información local.</p>
      </section>

      <section id="legal-contenido" className="grid gap-1">
        <h4 className="font-bold">5. Responsabilidad sobre el contenido</h4>
        <p>La veracidad, exactitud y contenido de los datos ingresados en los formatos (nombres, número de control, calificaciones, redacción de evidencias, imágenes, instrumentaciones y demás) son absoluta responsabilidad del estudiante que los captura.</p>
        <p>Antes de entregar, verifica que el formato generado corresponda a la versión oficial vigente solicitada por tu docente o división; la institución puede modificar sus formatos sin previo aviso.</p>
      </section>

      <section id="legal-exencion" className="grid gap-1">
        <h4 className="font-bold">6. Limitación de responsabilidad</h4>
        <p>El desarrollador no se hace responsable por rechazos de entregas, penalizaciones académicas, errores de formato derivados de modificaciones institucionales de última hora ni por un mal uso de la herramienta.</p>
      </section>

      <section id="legal-propiedad" className="grid gap-1">
        <h4 className="font-bold">7. Propiedad intelectual y código abierto</h4>
        <p>El código fuente de RinoDocs es público y se distribuye bajo la Licencia MIT. Cualquier persona puede auditarlo, revisarlo o contribuir respetando los términos de dicha licencia y los créditos de autoría original.</p>
        <p><a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-[var(--accent)]"><Icon name="github" size={14} /> Ver código fuente</a></p>
      </section>

      <section id="legal-cambios" className="grid gap-1">
        <h4 className="font-bold">8. Modificaciones de la aplicación y los términos</h4>
        <p>RinoDocs está en fase Alpha y en constante evolución. El desarrollador se reserva el derecho de actualizar, modificar o suspender características de la aplicación, así como estos términos, para mejorar la experiencia sin previo aviso. Los cambios relevantes se anuncian en el historial de versiones y pueden pedirte aceptar de nuevo.</p>
      </section>

      <section id="legal-contacto" className="grid gap-1">
        <h4 className="font-bold">9. Contacto</h4>
        <p>Para dudas, reportes o propuestas puedes abrir un issue en el repositorio público del proyecto.</p>
        <p><a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-[var(--accent)]"><Icon name="github" size={14} /> Reportar o proponer</a></p>
      </section>
    </article>
  )
}

/** Modal del documento. En modo bloqueo no se puede cerrar sin aceptar. */
export default function ModalLegal({ modo, onAceptar, onCerrar }: {
  modo: 'bloqueo' | 'lectura'
  onAceptar?: () => void
  onCerrar?: () => void
}) {
  const bloqueo = modo === 'bloqueo'
  useEffect(() => {
    if (bloqueo) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar?.() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [bloqueo, onCerrar])
  return (
    <div
      className="fixed inset-0 z-40 overflow-y-auto bg-black/70 px-0 pb-0 pt-[10dvh] md:p-4"
      onClick={bloqueo ? undefined : onCerrar}
      role="dialog" aria-modal="true" aria-label="Términos de uso y aviso de privacidad"
    >
      <div className="dialogo mx-auto max-w-2xl p-4 md:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <MarcaRD size={40} />
          <div>
            <h3 className="display text-2xl font-bold">Términos de uso y aviso de privacidad</h3>
            <p className="text-xs t-muted">RinoDocs · proyecto comunitario, sin afiliación institucional</p>
          </div>
        </div>
        {bloqueo && (
          <p className="aviso aviso-warn mt-3 text-[13px]">
            Para continuar necesitas aceptar los términos. Sin aceptación no es posible usar la aplicación.
          </p>
        )}
        <div className="mt-3 max-h-[55dvh] overflow-y-auto rounded-xl border t-line p-3">
          <ContenidoLegal />
        </div>
        <div className="sticky bottom-0 mt-3 flex flex-wrap gap-2 bg-transparent">
          {bloqueo ? (
            <button onClick={onAceptar} className="touch-btn flex items-center gap-2 rounded-xl bg-[var(--ok-bg)] px-5 font-bold text-[var(--ok-ink)]">
              <Icon name="check" size={15} /> Acepto los términos
            </button>
          ) : (
            <button onClick={onCerrar} className="touch-btn rounded-xl t-surface2 px-5 font-semibold">Cerrar</button>
          )}
        </div>
      </div>
    </div>
  )
}
