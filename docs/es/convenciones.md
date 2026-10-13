# Convenciones (referencia)

- UI y comentarios en español; comentarios concisos, sin diarios de razonamiento. Sin emojis (solo iconos Lucide, ni `✓`).
- Referencias a código como `ruta:línea` (p. ej. `app/src/ui/MateriasPanel.tsx:97`).
- Herramientas: `read` para leer, `edit` con `oldString` mínimo y único, `write` solo para crear; `shell` para comandos reales, `python3 -c` para cómputos puntuales; navegador vía `execute` + `tools["firefox-devtools"]`.
- Verificación obligatoria en `app/`: `./node_modules/.bin/tsc -b --force` y `./node_modules/.bin/vitest run` (57). `tsc --noEmit` suelto no revisa nada (referencias de proyecto). Cambios de parser exigen evidencia de paridad PDF/DOCX.
- Preferencia de formato: **DOCX sobre PDF** en instrumentación (pre-render íntegro; PDFs tal cual).
- Prohibido: commitear refs `*.docx`/`*.pdf`; autopromo dentro del PDF (solo metadata Creator); deformar imágenes (usar `encajar`); páginas gigantes (ajuste a carta con `anchoPct`/`escala` manual); reordenar `ORDEN_GRUPOS` o cruzar evidencias entre grupos; pisar captura manual con herencia; aplanar texto PDF con `join(' ')` (usar `hasEOL`); jerga dev en la UI (`parser`, `pre-render`, `confianza %`, `réplica exacta`); tocar `week`/pestañas u orden de grupos sin aval TESCI.
