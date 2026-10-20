# Changelog

Formato: Keep a Changelog + SemVer. Entradas bilingües (ES/EN) por release. / Format: Keep a Changelog + SemVer. Bilingual entries per release.

## [Unreleased] / [Sin publicar]

### Corregido / Fixed
- Nueva evidencia hereda la materia filtrada en la sección de Evidencias: antes se quedaba siempre con la primera materia de la lista y el documento salía con la asignatura, el docente y el grupo de otra materia. / New evidence now inherits the subject selected in the Evidencias filter; it no longer defaults to the first subject in the list.
- Al cambiar de materia en el wizard, la competencia (7), la descripción (8) y los indicadores (9) se re-derivan de la instrumentación de esa materia y se limpian si ya no existen en ella. / Switching subject in the wizard re-derives competence (7), description (8) and indicators (9) from that subject's instrumentation, clearing them when they no longer apply.
- La materia elegida ya no se revierte sola al editar una evidencia, y el docente de la materia anterior no se arrastra al cambiar. / The selected subject no longer reverts by itself when editing, and the previous subject's teacher is no longer carried over.
- El grupo (2) y el docente (4) se pueden corregir a mano, y el ajuste solo aplica a la materia donde se capturó. / Group (2) and teacher (4) can be corrected by hand; the adjustment only applies to the subject where it was entered.

### Añadido / Added
- El wizard muestra siempre la materia activa y, en el paso Revisar, una vista previa de la tabla de datos (1 a 10) tal como saldrá impresa. / The wizard always shows the active subject, and the Review step previews the data table (1 to 10) exactly as it will print.
- Si no hay materia filtrada, la evidencia nueva se abre sin materia y hay que elegirla antes de continuar. / With no subject selected, a new evidence opens empty and requires choosing one before continuing.

## [0.1.0-beta] — 2026-10-17

### Añadido / Added
- SEO e imagen social: `robots.txt`, `sitemap.xml`, tarjeta OpenGraph 1200×630 (`og.png`) y datos estructurados `SoftwareApplication`; `twitter:card` pasa a `summary_large_image`. / SEO and social card: robots.txt, sitemap.xml, 1200x630 OpenGraph image and SoftwareApplication structured data; twitter:card moves to summary_large_image.
- Términos de uso y aviso de privacidad con aceptación obligatoria al primer arranque (funcionamiento local, no afiliación al TESCI, código MIT). / Terms of use and privacy notice with mandatory first-run acceptance.
- Importar PDF entregado: agrega a evidencias un PDF ya entregado tal cual (no editable), con nombre, competencia, vista previa y copia íntegra al portafolio. / Import an already-submitted PDF as read-only evidence, copied as-is into the portfolio.

### Corregido / Fixed
- Visor PDF propio en móvil: virtualización real (solo pinta páginas en vista y libera el resto), worker empaquetado por instancia, reintento por página y global, errores visibles con mensaje. Límite dedicado: un fallo del visor ya no tumba la pestaña. / Mobile PDF viewer hardened: true virtualization, bundled worker, per-page and global retry, visible errors, dedicated boundary so viewer crashes no longer kill the tab.
- Vista previa en móvil: visor propio con pdf.js en dispositivos táctiles (todas las páginas bajo demanda, sin depender del visor nativo que falla en PWA/móvil); en escritorio se conserva el visor nativo. / Mobile preview now uses a built-in pdf.js viewer on touch devices (all pages on demand); desktop keeps the native viewer.
- Parser de instrumentación robusto (DOCX por tablas, PDF por columnas): temas sin encabezados ni columnas vecinas, indicadores multilínea completos sin `|` ni porcentaje (solo letra + descripción), descripciones sin cortes por palabras clave; verificado en 7 documentos. / Robust instrumentation parsing (table-driven DOCX, column-aware PDF): clean topics, complete multiline indicators without `|` or percentages, full descriptions; verified on 7 documents.
- Editor de indicadores de alcance: ya no pierde el foco al teclear ni reaparece el `|` al borrarlo (edición en texto libre con parseo diferido). / Scope-indicator editor no longer loses focus while typing and deleted `|` no longer reappears.
- Portafolio en pantallas angostas: las filas de secciones ya no desbordan lateralmente (título truncado + acciones en segunda línea), la navegación inferior permanece fija. / Portfolio on narrow screens no longer overflows horizontally; bottom navigation stays fixed.
- Metas sociales unificadas: la descripción, OpenGraph y Twitter decían "alpha" mientras la interfaz decía "beta". / Social metadata unified: description, OpenGraph and Twitter said "alpha" while the UI said "beta".

### Cambiado / Changed
- Identidad visual tinta y papel (serif académica) y armador libre del portafolio: portada fija y bloques de índice/instrumentación reordenables con arrastrar, subir/bajar y presets. / Ink-and-paper visual identity and free portfolio assembler: fixed cover plus reorderable index/instrumentation blocks.
- Estado del proyecto: alpha → beta (`0.1.0-beta`) en código, documentación y términos. Los términos suben a `2026-10-17-v2`, así que piden una nueva aceptación. / Project status alpha → beta across code, docs and terms. Terms bump to `2026-10-17-v2`, requiring re-acceptance.
- Despliegue por dashboard de Cloudflare Pages (integración Git) como vía principal; `ci.yml` queda solo con `check` (sin job `deploy` ni secrets). / Dashboard deploys as the primary path; `ci.yml` now checks only.

## [0.1.0-alpha] — 2026-10-13

### Añadido / Added
- Flujo Perfil → Materias → Evidencias → Portafolio con PDF FO-205P11000-14 y portafolio cliqueable (portada, índice con paginación real, instrumentación, diagnóstica, portadas por competencia). / Profile → Subjects → Evidence → Portfolio flow with FO-205P11000-14 PDF and clickable portfolio.
- Parser de instrumentación FO-205P11000-44 tolerante (DOCX preferido / PDF copiado tal cual), pre-render DOCX íntegro una vez al cargar, validación manual y `necesitaRevision` si confianza < 0.75. / Tolerant FO-205P11000-44 parser (DOCX preferred / PDF copied as-is), one-time full DOCX pre-render, manual validation.
- Persistencia Dexie IndexedDB `rino-docs` v2 + borradores con autosave de 15 días + LocalStorage de perfil/tema. / Dexie persistence + 15-day draft autosave.
- PWA offline-first (Workbox precache), ajuste de imagen a carta sin deformar, `rotar90`, código con lenguaje (python/java/c/sql). / Offline-first PWA, letter-fit images, code highlighting.
- Documentación oficial bilingüe, CI (`.github/workflows/ci.yml`, deploy solo en `main`) y plantillas de issue/PR. / Bilingual docs, CI (deploy only on `main`), templates.

### Estado Alpha / Alpha status
- Pendiente pulido: subida PDF end-to-end en navegador y variantes de parser bajo demanda. / Pending: end-to-end PDF upload check and on-demand parser variants.
- Sin backend; sincronización colaborativa solo como exploración post-Alpha (ver `ROADMAP.md`). / No backend; collaborative sync is post-Alpha exploration only.
