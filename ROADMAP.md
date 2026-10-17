# Roadmap

> En español: [`ROADMAP.es.md`](ROADMAP.es.md). Status: Beta (`0.1.0-beta`).

## Now (Beta polish)
- [ ] End-to-end PDF upload check in the browser (only DOCX verified end-to-end so far).
- [ ] On-demand parser variants: when a new subject format arrives, request the file and add variant + unit test (paste fragments as text; never commit `*.docx`/`*.pdf`).
- [ ] Mid-term: standardize the instrumentation format with the department (non-blocking).

## Next (robust parsing)
- [ ] Variant table per teacher/career with regression corpus (`runIf` skips when local refs missing).
- [ ] Keep confidence threshold 0.75 + `necesitaRevision`; never flatten PDF text with `join(' ')` (use `textoPdfConLayout`/`hasEOL`).
- [ ] Keep DOCX-preferred: full pre-render once at load; portfolio only copies pages; PDF originals copied as-is.

## Exploration (post-Beta, design only — not promised)
- [ ] Lightweight backend for collaborative work synchronized across different portfolios with classmates: offline-first constraints, Dexie v2 → sync mapping, conflict policy (manual merge, no silent overwrites), privacy (student data minimization). No backend ships in Beta.
