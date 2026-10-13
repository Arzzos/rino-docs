# Rino Docs — TESCI Portfolios and Evidence (Offline-First)

> Status: **Alpha (`0.1.0-alpha`)**. Core flow works; several details still being polished.
> Leer en español: [`README.es.md`](README.es.md).

Client-only PWA (React 19 + TS + Vite + Tailwind 4) to generate the **FO-205P11000-14**
evidence form as an exact PDF replica, assemble institutional portfolios, and embed
complete **FO-205P11000-44** instrumentations. No backend.

Flow: **Profile → Subjects** (upload instrumentation, validate, optional diagnostics) →
**Evidence** (3-step wizard + PDF) → **Portfolio** (fixed groups + clickable PDF).

- Preferred instrumentation format: **DOCX** (full pre-render; PDF originals are copied as-is).
- Storage: Dexie IndexedDB `rino-docs` v2 + LocalStorage for profile/theme.
- Deploy: Cloudflare Pages, root `app`, build `pnpm build`, output `dist`, Node 20+.

## Quickstart

```bash
cd app
pnpm install
pnpm dev      # dev server
./node_modules/.bin/tsc -b --force   # typecheck (project references)
./node_modules/.bin/vitest run       # tests (57)
pnpm build    # static dist/
pnpm deploy   # Pages deploy (needs wrangler login once)
```

## Docs

- Contributing: [`CONTRIBUTING.md`](CONTRIBUTING.md) — never work directly on `main`.
- Conduct: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) · Security: [`SECURITY.md`](SECURITY.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md) · Roadmap: [`ROADMAP.md`](ROADMAP.md)
- Guides: [`docs/en/`](docs/en/) (tutorial, how-tos, architecture, CI/CD, conventions).

Reference `*.docx`/`*.pdf` files are git-ignored; never commit them.

## License

MIT — see [`LICENSE`](LICENSE).
