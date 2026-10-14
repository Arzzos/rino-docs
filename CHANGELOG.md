# Changelog

Formato: Keep a Changelog + SemVer. Entradas bilingües (ES/EN) por release. / Format: Keep a Changelog + SemVer. Bilingual entries per release.

## [Unreleased] / [Sin publicar]

### Añadido / Added
- Términos de uso y aviso de privacidad con aceptación obligatoria al primer arranque (funcionamiento local, no afiliación al TESCI, código MIT). / Terms of use and privacy notice with mandatory first-run acceptance.
- Importar PDF entregado: agrega a evidencias un PDF ya entregado tal cual (no editable), con nombre, competencia, vista previa y copia íntegra al portafolio. / Import an already-submitted PDF as read-only evidence, copied as-is into the portfolio.

### Corregido / Fixed
- Vista previa en móvil: visor propio con pdf.js en dispositivos táctiles (todas las páginas bajo demanda, sin depender del visor nativo que falla en PWA/móvil); en escritorio se conserva el visor nativo. / Mobile preview now uses a built-in pdf.js viewer on touch devices (all pages on demand); desktop keeps the native viewer.
- Parser de instrumentación robusto (DOCX por tablas, PDF por columnas): temas sin encabezados ni columnas vecinas, indicadores multilínea completos sin `|` ni porcentaje (solo letra + descripción), descripciones sin cortes por palabras clave; verificado en 7 documentos. / Robust instrumentation parsing (table-driven DOCX, column-aware PDF): clean topics, complete multiline indicators without `|` or percentages, full descriptions; verified on 7 documents.
- Editor de indicadores de alcance: ya no pierde el foco al teclear ni reaparece el `|` al borrarlo (edición en texto libre con parseo diferido). / Scope-indicator editor no longer loses focus while typing and deleted `|` no longer reappears.
- Portafolio en pantallas angostas: las filas de secciones ya no desbordan lateralmente (título truncado + acciones en segunda línea), la navegación inferior permanece fija. / Portfolio on narrow screens no longer overflows horizontally; bottom navigation stays fixed.

### Cambiado / Changed
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
