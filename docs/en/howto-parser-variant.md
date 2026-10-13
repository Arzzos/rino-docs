# How-to: add a new parser variant

Problem: a teacher's instrumentation layout is misread (wrong topics, indicators A–F, or competence split).

1. Open a `parser-variant` issue (`.github/ISSUE_TEMPLATE/parser-variant.yml`): subject, format (**DOCX preferred**), what was extracted vs expected, and the relevant fragment pasted as text. Never attach files with personal data.
2. In code, extend the pure helpers in `app/src/infrastructure/instrumentParser.ts` (`extraerNumeroCompetencia`, `extraerTemas`, `extraerIndicadores`, `extraerEvidencias`, `normalizarTextoExtraido`) — keep them browser-free for tests.
3. Add a unit test in `app/tests/unidad.test.ts` with the new fragment; keep the confidence rule (≥ 0.75, else `necesitaRevision`); never flatten PDF text with `join(' ')` — use `textoPdfConLayout`/`hasEOL`.
4. Verify: `./node_modules/.bin/tsc -b --force`, `./node_modules/.bin/vitest run`, and PDF/DOCX parity evidence. Open the PR from a `fix/parser-<topic>` branch.
