# Cómo: añadir una variante de parser

Problema: un formato de instrumentación se lee mal (temas, indicadores A–F o división de competencias).

1. Abre un issue `parser-variant` (`.github/ISSUE_TEMPLATE/parser-variant.yml`): materia, formato (**DOCX preferido**), qué extrajo vs qué esperabas y el fragmento pegado como texto. Nunca adjuntes archivos con datos personales.
2. En código, extiende los helpers puros de `app/src/infrastructure/instrumentParser.ts` (`extraerNumeroCompetencia`, `extraerTemas`, `extraerIndicadores`, `extraerEvidencias`, `normalizarTextoExtraido`) — mantenlos libres de navegador para testear.
3. Añade un test en `app/tests/unidad.test.ts` con el fragmento nuevo; conserva el umbral (≥ 0.75 o `necesitaRevision`); nunca aplanes texto PDF con `join(' ')` — usa `textoPdfConLayout`/`hasEOL`.
4. Verifica: `./node_modules/.bin/tsc -b --force`, `./node_modules/.bin/vitest run` y evidencia de paridad PDF/DOCX. Abre el PR desde una rama `fix/parser-<tema>`.
