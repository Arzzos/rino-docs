# Contributing to Rino Docs

> Alpha project (`0.1.0-alpha`). Thanks for helping polish it.
> En español: [`CONTRIBUTING.es.md`](CONTRIBUTING.es.md).

## 1. Branch rule (mandatory)

- **Never push or commit directly to `main`.** `main` is deployed automatically (see `docs/en/ci-cd.md`).
- Work on a branch: `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `test/<topic>`.
- Open a PR to `main` using `.github/PULL_REQUEST_TEMPLATE.md`. Enable "branch protection" on GitHub (require PR + CI green).

```bash
git checkout -b feat/my-change
# ... work ...
git push -u origin feat/my-change
```

## 2. Required checks (run in `app/`)

```bash
./node_modules/.bin/tsc -b --force   # NOT bare tsc --noEmit (ignores project references)
./node_modules/.bin/vitest run       # 57 tests must pass
pnpm build                           # must succeed
```

Note: `pnpm exec` may fail in sandboxed envs (ignored builds policy); use the direct binaries above.

## 3. Conventions

- UI and comments in Spanish; code references as `path:line`.
- UI: Lucide icons only, no emojis (not even `✓`); short semantic copy, no dev jargon (`parser`, `pre-render`, `confianza %`).
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Parser changes: add a unit test in `app/tests/unidad.test.ts` and show PDF/DOCX parity evidence.
- Never commit `*.docx`/`*.pdf` reference files (git-ignored). Never put promo inside PDF content (Creator metadata only).

Full list: [`docs/en/conventions.md`](docs/en/conventions.md), [`docs/en/architecture.md`](docs/en/architecture.md).

## 4. Reporting issues

Use `.github/ISSUE_TEMPLATE/`: `bug.yml`, `parser-variant.yml` (paste the fragment as text, do not attach files with personal data), `feature.yml`. One issue per problem, with version, steps, and expected vs actual.
