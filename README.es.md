# Rino Docs — Portafolios y evidencias TESCI (Offline-First)

> Estado: **Alpha (`0.1.0-alpha`)**. El flujo principal funciona; hay detalles por pulir.
> Read in English: [`README.md`](README.md).

PWA 100% cliente (React 19 + TS + Vite + Tailwind 4) para generar el formato
**FO-205P11000-14** como réplica exacta en PDF, ensamblar portafolios institucionales
e incrustar instrumentaciones **FO-205P11000-44** íntegras. Sin backend.

Flujo: **Perfil → Materias** (subir instrumentación, validar, diagnóstica opcional) →
**Evidencias** (wizard 3 pasos + PDF) → **Portafolio** (grupos fijos + PDF cliqueable).

- Formato preferido de instrumentación: **DOCX** (pre-render íntegro; los PDF se copian tal cual).
- Persistencia: Dexie IndexedDB `rino-docs` v2 + LocalStorage para perfil/tema.
- Despliegue: Cloudflare Pages, raíz `app`, build `pnpm build`, salida `dist`, Node 20+.

## Inicio rápido

```bash
cd app
pnpm install
pnpm dev      # desarrollo
./node_modules/.bin/tsc -b --force   # verificación (referencias de proyecto)
./node_modules/.bin/vitest run       # pruebas (57)
pnpm build    # dist/ estática
pnpm deploy   # despliegue Pages (requiere wrangler login una vez)
```

## Documentación

- Colaborar: [`CONTRIBUTING.es.md`](CONTRIBUTING.es.md) — nunca trabajes directo en `main`.
- Conducta: [`CODE_OF_CONDUCT.es.md`](CODE_OF_CONDUCT.es.md) · Seguridad: [`SECURITY.es.md`](SECURITY.es.md)
- Cambios: [`CHANGELOG.md`](CHANGELOG.md) · Ruta: [`ROADMAP.es.md`](ROADMAP.es.md)
- Guías: [`docs/es/`](docs/es/) (tutorial, how-tos, arquitectura, CI/CD, convenciones).

Los `*.docx`/`*.pdf` de referencia están ignorados por git; nunca los commitees.

## Licencia

MIT — ver [`LICENSE`](LICENSE).
