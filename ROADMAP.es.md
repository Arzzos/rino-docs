# Ruta del proyecto (Roadmap)

> In English: [`ROADMAP.md`](ROADMAP.md). Estado: Alpha (`0.1.0-alpha`).

## Ahora (pulido Alpha)
- [ ] Probar subida de PDF end-to-end en navegador (hasta hoy solo DOCX verificado).
- [ ] Variantes de parser bajo demanda: si llega un formato nuevo, pedir el archivo y añadir variante + test (pegar fragmentos como texto; nunca commitear `*.docx`/`*.pdf`).
- [ ] Mediano plazo: estandarizar el formato con dirección (no bloquea).

## Siguiente (parser robusto)
- [ ] Tabla de variantes por docente/carrera con corpus de regresión (`runIf` omite si faltan refs locales).
- [ ] Mantener umbral de confianza 0.75 + `necesitaRevision`; nunca aplanar texto PDF con `join(' ')` (usar `textoPdfConLayout`/`hasEOL`).
- [ ] Mantener DOCX-preferido: pre-render completo una vez al cargar; el portafolio solo copia páginas; PDFs originales tal cual.

## Exploración (post-Alpha, solo diseño — sin promesa)
- [ ] Backend ligero para trabajos colaborativos sincronizados entre portafolios distintos con compañeros: restricciones offline-first, mapeo Dexie v2 → sync, política de conflictos (fusión manual, sin sobrescrituras silenciosas), privacidad (minimización de datos de alumnos). Nada de backend en Alpha.
