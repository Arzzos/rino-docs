# Architecture (reference)

Hexagonal layout in `app/src/`:

- `domain/`: pure entities, no frameworks. `types.ts` (Alumno, Competencia, Instrumentacion, Evidencia with 10 fields, Diagnostica, Portafolio, `ORDEN_GRUPOS`, `validarEvidencia()`, `uid()`), `herencia.ts` (subject/profile → evidence without overwriting manual input), `migrate.ts` (legacy v1 normalization on read).
- `infrastructure/`: output adapters. `instrumentParser.ts` (mammoth + JSZip + pdfjs, tolerant; `necesitaRevision` when confidence < 0.75), `docxFullRender.ts` (full DOCX→PDF pre-render once at load; portfolio only copies pages), `fo14Pdf.ts` (exact FO-205P11000-14 replica, 9-col grid), `portfolioPdf.ts` (cover + real-pagination clickable index + instrumentation + diagnostics + per-competence covers + evidence; PDF originals copied as-is), `db.ts` (Dexie v2), `borradores.ts` (15-day autosave), `imageOptimizer.ts` (max 1600px, `rotar90`), `pdfTheme.ts` (letter 612×792, `encajar` without distortion), `codeHighlight.ts` (offline python/java/c/sql).
- `ui/`: input adapters (React). `MateriasPanel`, `EvidenciaEditor` (Datos→Contenido→Revisar wizard + live preview), `PortafolioPanel` (fixed group order, free internal order, drag&drop), `PreviewModal`, `ConfirmDialog`, `ErrorBoundary`.

Key invariants: fixed `ORDEN_GRUPOS` order; letter-fit images; Creator metadata `Rino Docs (offline-first)` only, no in-content promo. Tests: `app/tests/unidad.test.ts` (90, vitest; real-file cases skip via `runIf` when local refs missing).
