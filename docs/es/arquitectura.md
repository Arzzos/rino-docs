# Arquitectura (referencia)

Layout hexagonal en `app/src/`:

- `domain/`: entidades puras, sin frameworks. `types.ts` (Alumno, Competencia, Instrumentacion, Evidencia de 10 campos, Diagnostica, Portafolio, `ORDEN_GRUPOS`, `validarEvidencia()`, `uid()`), `herencia.ts` (materia/perfil → evidencia sin pisar captura manual), `migrate.ts` (normalización legacy v1 al leer).
- `infrastructure/`: adaptadores de salida. `instrumentParser.ts` (mammoth + JSZip + pdfjs, tolerante; `necesitaRevision` si confianza < 0.75), `docxFullRender.ts` (pre-render DOCX→PDF íntegro una vez al cargar; el portafolio solo copia páginas), `fo14Pdf.ts` (réplica exacta FO-205P11000-14, rejilla 9 cols), `portfolioPdf.ts` (portada + índice cliqueable con paginación real + instrumentación + diagnóstica + portadas por competencia + evidencias; PDFs originales tal cual), `db.ts` (Dexie v2), `borradores.ts` (autosave 15 días), `imageOptimizer.ts` (máx 1600px, `rotar90`), `pdfTheme.ts` (carta 612×792, `encajar` sin deformar), `codeHighlight.ts` (python/java/c/sql offline).
- `ui/`: adaptadores de entrada (React). `MateriasPanel`, `EvidenciaEditor` (wizard Datos→Contenido→Revisar + vista previa viva), `PortafolioPanel` (orden de grupos fijo, orden interno libre, drag&drop), `PreviewModal`, `ConfirmDialog`, `ErrorBoundary`.

Invariantes: orden `ORDEN_GRUPOS` fijo; imágenes ajustadas a carta; autoría solo en metadata Creator `Rino Docs (offline-first)`. Tests: `app/tests/unidad.test.ts` (90, vitest; casos con archivos reales se omiten con `runIf` si faltan las refs locales).
