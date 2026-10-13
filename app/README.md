# Rino Docs — Portafolios y Evidencias TESCI (Offline-First)

PWA 100% del lado del cliente para generar el **FO-205P11000-14** (réplica exacta en PDF),
ensamblar **portafolios institucionales** e incrustar **instrumentaciones FO-205P11000-44** íntegras.

## Arquitectura hexagonal

```
src/
  domain/            Entidades puras + validación FO-205P11000-14 (sin frameworks)
  infrastructure/    Adaptadores de salida:
    db.ts                IndexedDB (Dexie v2: materias, instrumentaciones,
                         evidencias, portafolios, diagnósticas) + LocalStorage perfil
    instrumentParser.ts  mammoth + JSZip + pdfjs, tolerante + editor manual
    imageOptimizer.ts    canvas: máx 1600px, JPEG 0.92 / PNG con alfa
    pdfTheme.ts          carta 612×792, header 3 logos + footer dirección en todo
    codeHighlight.ts     highlight.js offline (python, java, c, sql) → UI + PDF
    fo14Pdf.ts           réplica exacta: rejilla 9 cols del .docx, equipo (5),
                         imágenes full-bleed ajustadas a carta, código con lenguaje
    docxFullRender.ts    instrumentación .docx ÍNTEGRA a PDF (párrafos, tablas,
                         imágenes, membretes propios, orientación original)
    portfolioPdf.ts      portada réplica + índice cliqueable (paginación real,
                         links + outline) + instrumentación + diagnóstica +
                         portadas por competencia + evidencias
  ui/                Adaptadores de entrada (React):
    MateriasPanel      materias + instrumentación + diagnósticas + validador
    EvidenciaEditor    wizard Datos → Contenido → Revisar, equipo manual,
                       código con lenguaje, tablas editables, ajuste de imagen
    PortafolioPanel    grupos fijos + orden interno drag&drop + vista previa
    PreviewModal       vista previa PDF fullscreen (iframe local)
```

## Decisiones clave (riesgos cuidados)

- **Sin páginas gigantes**: toda imagen se ajusta a carta sin perder fidelidad
  (escalado vectorial, bytes originales intactos) + sliders manuales de ancho
  y ajuste vertical por imagen.
- **Equipo manual por evidencia**: campo (5) con titular + N integrantes
  agregados a mano (no todo es en equipo).
- **Índice fijo pero dinámico**: grupos en orden institucional
  (portada → índice → instrumentación → diagnóstica → contenido);
  orden libre dentro de cada grupo. Números de página reales (dos pasadas),
  entradas cliqueables (anotaciones Link) y outline del documento.
- **Instrumentación íntegra**: PDF original copiado tal cual; DOCX renderizado
  completo (tablas de metadatos, caracterización, imágenes, landscape) +
  archivo original adjunto al PDF.
- **Parser validado** con instrumentación real de Cálculo 2026-2:
  4 competencias, 13–16 temas, A–F, confianza 1.0.
- **Offline**: Workbox precache total, todo en IndexedDB.

## Despliegue en Cloudflare Pages (dashboard + GitHub)

1. Sube el repo a GitHub (los `.docx`/`.pdf` de referencia no viajan: están ignorados).
2. En el dashboard: Workers y Pages → Crear → Pages → Conectar con Git → elige el repo.
3. Configuración de compilación:
   - **Directorio raíz:** `app`
   - **Comando de compilación:** `pnpm build` (o `npm run build`)
   - **Directorio de salida:** `dist`
   - **Node:** 20+
4. `app/public/_headers` ya define caché correcta (`sw.js` sin caché, assets inmutables).
   No se necesita `_redirects`: la app es de una sola ruta con pestañas por estado.

## Despliegue por CLI (Wrangler)

```bash
cd app
pnpm build
npx wrangler login          # solo la primera vez (abre el navegador)
pnpm deploy                 # wrangler pages deploy dist --project-name rino-docs
```

`app/wrangler.jsonc` fija el nombre del proyecto (`rino-docs`) y la salida
(`dist`). Para un nombre distinto, edita `name` en `wrangler.jsonc` y el flag
`--project-name` del script `deploy` en `app/package.json`.

Dominio final: `https://rinodocs.arzzos.com` (dominio personalizado de
Cloudflare Pages; apunta el DNS con un CNAME hacia `rino-docs.pages.dev`).

## Uso

```bash
cd app
pnpm install
pnpm dev      # desarrollo
pnpm test     # pruebas (vitest)
pnpm build    # dist/ lista para hosting estático (HTTPS)
pnpm preview  # verificar PWA
pnpm deploy   # publicar dist/ en Cloudflare Pages (requiere wrangler login)
```

Flujo: **Perfil** → **Materias** (subir instrumentación, validar, diagnóstica
opcional) → **Evidencias** (wizard 3 pasos + PDF) → **Portafolio**
(ordenar por grupos + generar PDF cliqueable).

Las pruebas con instrumentaciones reales se omiten si los archivos no están
(son referencia local ignorada por git: `*.docx`/`*.pdf` en la raíz).

## Licencia

MIT — ver [LICENSE](../LICENSE).
