# Cómo contribuir a Rino Docs

> Proyecto en Beta (`0.1.0-beta`). Gracias por ayudar a pulirlo.
> In English: [`CONTRIBUTING.md`](CONTRIBUTING.md).

## 1. Regla de ramas (obligatoria)

- **Nunca hagas push ni commits directos a `main`.** `main` se despliega automáticamente (ver `docs/es/ci-cd.md`).
- Trabaja en una rama: `feat/<tema>`, `fix/<tema>`, `docs/<tema>`, `test/<tema>`.
- Abre un PR hacia `main` con `.github/PULL_REQUEST_TEMPLATE.md`. Activa "branch protection" en GitHub (exigir PR + CI en verde).

```bash
git checkout -b feat/mi-cambio
# ... trabajar ...
git push -u origin feat/mi-cambio
```

## 2. Verificación obligatoria (en `app/`)

```bash
./node_modules/.bin/tsc -b --force   # NO usar tsc --noEmit suelto (ignora referencias)
./node_modules/.bin/vitest run       # 57 pruebas en verde
pnpm build                           # debe compilar
```

Nota: `pnpm exec` puede fallar en entornos restringidos (política de builds ignorados); usa los binarios directos.

## 3. Convenciones

- UI y comentarios en español; referencias como `ruta:línea`.
- UI: solo iconos Lucide, sin emojis (ni `✓`); copy corto y semántico, sin jerga dev (`parser`, `pre-render`, `confianza %`).
- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Cambios de parser: añade test en `app/tests/unidad.test.ts` y evidencia de paridad PDF/DOCX.
- Nunca commitees `*.docx`/`*.pdf` de referencia (ignorados por git). Nada de autopromo dentro del PDF (solo metadata Creator).

Detalle: [`docs/es/convenciones.md`](docs/es/convenciones.md), [`docs/es/arquitectura.md`](docs/es/arquitectura.md).

## 4. Reportar issues

Usa `.github/ISSUE_TEMPLATE/`: `bug.yml`, `parser-variant.yml` (pega el fragmento como texto, no adjuntes archivos con datos personales), `feature.yml`. Un issue por problema, con versión, pasos y esperado vs obtenido.
