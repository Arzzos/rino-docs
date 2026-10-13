# Conventions (reference)

- UI and comments in Spanish; concise comments, no reasoning diaries. No emojis (Lucide icons only, not even `✓`).
- Code references as `path:line` (e.g. `app/src/ui/MateriasPanel.tsx:97`).
- Tools: `read` for reading, `edit` with minimal unique `oldString`, `write` only to create; `shell` for real commands, `python3 -c` for one-off computations; browser via `execute` + `tools["firefox-devtools"]`.
- Mandatory verification in `app/`: `./node_modules/.bin/tsc -b --force` and `./node_modules/.bin/vitest run` (57). Bare `tsc --noEmit` reviews nothing (project references). Parser changes require PDF/DOCX parity evidence.
- Format preference: **DOCX over PDF** for instrumentation (full pre-render; PDFs copied as-is).
- Forbidden: committing `*.docx`/`*.pdf` refs; in-PDF promo (Creator metadata only); distorting images (use `encajar`); oversized pages (letter-fit with manual `anchoPct`/`escala`); reordering `ORDEN_GRUPOS` or crossing evidence between groups; overwriting manual input with inheritance; flattening PDF text with `join(' ')` (use `hasEOL`); dev jargon in UI (`parser`, `pre-render`, `confianza %`, `réplica exacta`); touching `week`/tabs or group order without TESCI approval.
