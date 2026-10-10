# Rino Docs — Portafolios y Evidencias TESCI (Offline-First)

PWA 100% del lado del cliente para generar el **FO-205P11000-14** (réplica exacta en PDF),
ensamblar **portafolios institucionales** y parsear **instrumentaciones FO-205P11000-44** (`.docx`/`.pdf`).

## Arquitectura hexagonal

```
src/
  domain/            Entidades puras + validación FO-205P11000-14 (sin frameworks)
  application/       (casos de uso orquestados desde UI: perfil, parseo, export, ensamble)
  infrastructure/    Adaptadores salida:
    db.ts                IndexedDB (Dexie) + LocalStorage perfil
    instrumentParser.ts  mammoth + JSZip + pdfjs, tolerante + fallback manual
    imageOptimizer.ts    canvas: máx 1600px, JPEG 0.92 / PNG si hay alfa
    fo14Pdf.ts           pdf-lib réplica exacta Letter, membretes originales
    portfolioPdf.ts      portada + índice + instrumentación ORIGINAL + competencias + evidencias
  ui (App.tsx)       Adaptadores entrada: 4 módulos React mobile-first
  composition/       (wiring directo en componentes; sin singletons ocultos)
```

## Decisiones clave (riesgos cuidados)

- **Réplica exacta FO-205P11000-14**: Letter 612×792pt, márgenes reales del `.docx`
  (70.85/85.05pt), PNG de header/footer extraídos del original, tabla de 10 campos,
  sin instructivo (como pide la plantilla). Primera imagen contenida (máx 200pt) para
  no desalinear membretes; resto a flujo libre.
- **Portafolio incrusta el original**: PDF → páginas copiadas tal cual (membretes y
  orientación intactas). DOCX → adjunto embebido + sección renderizada en su
  orientación original (landscape de Cálculo preservado).
- **Imágenes pesadas**: se redimensionan a 1600px y recomprimen a JPEG 0.92
  (PNG solo con transparencia). Sin pérdida perceptible, ~10× menos peso.
- **Parser tolerante**: exige `Competencia No.:` con punto (no parte en
  "Competencia no alcanzada"), indicadores A–F por bloque (acepta más/menos letras),
  editor manual de validación siempre disponible. Validado con la instrumentación
  real de Cálculo Diferencial 2026-2: 4 competencias, 13–16 temas, A–F, confianza 1.0.
- **Offline**: `vite-plugin-pwa` (Workbox), precache total, todo en IndexedDB.

## Uso

```bash
cd app
pnpm install
pnpm dev      # desarrollo
pnpm build    # dist/ lista para hosting estático (HTTPS)
pnpm preview  # verificar PWA: /, /sw.js, /manifest.webmanifest
```

Flujo: **Perfil** (una vez) → **Materias** (subir instrumentación, validar) →
**Evidencias** (selector competencia + checkboxes + bloques + PDF al celular) →
**Portafolio** (drag & drop del orden + generar PDF).
