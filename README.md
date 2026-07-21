# pj-jurisprudencia-scraper

## Objetivo

Scraper para el sitio de jurisprudencia del Poder Judicial del Perú
(`https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/inicio.xhtml`), pensado para
buscar, paginar y descargar resoluciones judiciales de forma automatizada, junto con sus
metadatos, respetando límites de velocidad y con reintentos ante fallos transitorios.

## Restricciones

Este proyecto **no usa automatización de navegador** (nada de Puppeteer, Playwright o Selenium).
El sitio objetivo es una aplicación JSF/PrimeFaces, así que toda la interacción se hace por HTTP
puro con `axios` + `tough-cookie` (manejo de sesión/`ViewState`) + `cheerio` (parseo de HTML), sin
levantar un navegador real.

## Instalación

```bash
npm install
cp .env.example .env
```

Ajustá las variables en `.env` según necesites (todas tienen valores por defecto razonables).

## Comandos

| Comando                | Descripción                                                                 |
| ----------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`           | Ejecuta el CLI directamente con `tsx`, sin argumentos.                       |
| `npm run scrape`        | Ejecuta el comando `scrape` del CLI con las opciones por defecto del `.env`. |
| `npm run scrape:sample` | Corre una muestra acotada: 3 páginas, 30 documentos, con descarga de PDFs.   |
| `npm run scrape:dry`    | Corrida en seco (`--dry-run`): 1 página, 5 documentos, sin descargar PDFs.   |
| `npm run retry-failed`  | Reintenta los documentos que quedaron marcados como fallidos.                |
| `npm run build`         | Compila el proyecto TypeScript a `dist/`.                                   |
| `npm test`              | Corre la suite de tests una vez con Vitest.                                 |
| `npm run lint`          | Chequeo de tipos sin emitir (`tsc --noEmit`).                                |

## Variables de entorno

| Variable             | Valor por defecto                                                          | Descripción                                                         |
| --------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `BASE_URL`            | `https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/inicio.xhtml` | URL de inicio del sitio de jurisprudencia.                             |
| `OUTPUT_DIR`          | `output`                                                                     | Carpeta donde se guardan metadatos y PDFs descargados.                 |
| `MAX_PAGES`           | `3`                                                                          | Cantidad máxima de páginas de resultados a recorrer.                   |
| `MAX_DOCUMENTS`       | `30`                                                                         | Cantidad máxima de documentos a procesar por corrida.                  |
| `DOWNLOAD_PDFS`       | `true`                                                                       | Si se deben descargar los PDFs de las resoluciones (`true`/`false`).   |
| `REQUEST_TIMEOUT_MS`  | `30000`                                                                      | Timeout en milisegundos para cada petición HTTP.                       |
| `BASE_DELAY_MS`       | `1500`                                                                       | Demora base en milisegundos entre peticiones consecutivas.             |
| `MAX_RETRIES`         | `5`                                                                          | Cantidad máxima de reintentos ante fallos transitorios.                |
| `MAX_BACKOFF_MS`      | `60000`                                                                      | Tope máximo en milisegundos para el backoff exponencial de reintentos. |
| `PDF_CONCURRENCY`     | `1`                                                                          | Cantidad de descargas de PDF en paralelo.                              |
| `LOG_LEVEL`           | `info`                                                                       | Nivel de log de `pino` (`fatal`/`error`/`warn`/`info`/`debug`/`trace`/`silent`). |
| `SEARCH_BUTTON_ID`    | _(vacío, opcional)_                                                          | Fuerza un id/name de botón de búsqueda específico en vez de auto-detectarlo vía discovery. Usar solo si `SearchNavigator` elige el botón equivocado. |
| `RESULTS_TABLE_ID`    | _(vacío, opcional; default efectivo `formBuscador:panel`)_                   | Fuerza el id del contenedor de resultados en vez del default confirmado contra el sitio real. |
| `PAGINATOR_ID`        | _(vacío, opcional)_                                                          | Fuerza el id del paginador RichFaces (`span.rf-ds`) en vez de auto-detectarlo. Usar solo si `detectPaginator` elige el paginador equivocado o hay más de uno en la página. |
| `PAGE_SIZE`           | _(vacío, opcional)_                                                          | Validado y disponible para uso futuro; **todavía no está conectado** al payload real de búsqueda (ver [Roadmap de fases](#roadmap-de-fases)). |

## Cómo ejecutar discovery inicial y la búsqueda

Correr `npm run scrape:dry` (o cualquier invocación de `scrape`) ahora ejecuta, además de mostrar
la configuración efectiva, todo el flujo de reconocimiento + primera búsqueda contra el sitio real:

1. Abre una sesión JSF real (bootstrap de `ViewState` + cookies) contra `BASE_URL`, guarda el HTML
   crudo de la página inicial en `output/debug/initial-page.html`.
2. Corre un discovery heurístico sobre ese HTML (form, inputs ocultos, botones candidatos, tablas,
   paginadores, controles de PDF), guardando el resultado en `output/debug/discovery-report.json`.
3. Selecciona un botón de búsqueda (por `SEARCH_BUTTON_ID` si está configurado, o automáticamente
   entre los `candidateSearchButtons` del discovery) y arma el payload `form-urlencoded` (form id +
   inputs ocultos + `ViewState` + los parámetros embebidos en el `onclick` del botón elegido).
4. Envía el `POST` al `action` del formulario. **Importante**: contra el sitio real esto **no** es
   un flujo AJAX/partial-response — es un POST síncrono clásico que responde `302` y redirige a una
   página de resultados completa (`resultado.xhtml`), que `HttpClient` sigue automáticamente. La
   respuesta cruda se guarda en `output/debug/search-response.xml` (el nombre es fijo aunque el
   contenido real sea HTML, no XML) y el HTML "usable" resultante en `output/debug/page-1.html`.
5. Actualiza el `ViewState` de la sesión con el valor fresco que trae la página de resultados.

Todo esto corre siempre, incluso en `--dry-run`: acá "dry-run" significa "no hacer scraping de
múltiples páginas ni descarga de PDFs real" (funcionalidad de fases posteriores), no "saltear el
reconocimiento y la búsqueda inicial".

El reporte de discovery (`SiteDiscoveryReport`) contiene, todo en base a heurísticas best-effort
que nunca lanzan excepción:

- `formId` / `hiddenInputs`: el formulario principal detectado (mismo criterio que
  `JsfSession.initialize()`) y sus campos ocultos.
- `candidateSearchButtons`: botones/disparadores de acción (`button`, `input[type=submit|button|image]`,
  o `<a>` con `onclick` de JSF/RichFaces/PrimeFaces/ajax).
- `candidateTables`: tablas de la página, con sus encabezados (`th`) y cantidad de filas.
- `candidatePaginators`: elementos cuyo `class`/`id` sugiere un paginador (RichFaces `rf-ds`/`rf-dp`,
  PrimeFaces `ui-paginator`, o cualquier variante de "pag").
- `candidatePdfControls`: enlaces o controles relacionados con descarga de PDF.

La idea es usar este reporte para identificar los IDs reales que usa el sitio (formularios,
botones, tablas de resultados, paginación) antes de que una búsqueda con criterios reales y el
parseo de resultados (fases siguientes) dependan de esos IDs.

## Roadmap de fases

### Implementadas

- **Fase 0 — Scaffolding**: ✅ estructura del proyecto, configuración vía `zod` + `dotenv`,
  `package.json`/`tsconfig`/`vitest` y CLI base con `commander`.
- **Fase 1 — Configuración, CLI y logger**: ✅ `AppConfig` tipado (`src/config.ts`), parseo de
  argumentos separado en `src/cli/args.ts` (con override de `.env` por flags), logger `pino`
  (`src/utils/logger.ts`) y `src/index.ts` imprimiendo la configuración efectiva.
- **Fase 2 — Cliente HTTP robusto**: ✅ `HttpClient` (`src/http/http-client.ts`) con `axios` +
  `axios-cookiejar-support`/`tough-cookie` (cookie jar de sesión), rate limiting con `bottleneck`
  (`src/http/rate-limiter.ts`) y política de reintentos con backoff exponencial + jitter +
  `Retry-After` (`src/http/retry-policy.ts`), lanzando `HttpRequestError` controlado al agotar
  reintentos.
- **Fase 3 — Sesión JSF y ViewState**: ✅ `JsfSession` (`src/jsf/jsf-session.ts`) que inicializa la
  sesión, detecta el form principal y mantiene el `javax.faces.ViewState` actualizado; extracción
  de ViewState desde HTML y partial-response (`src/jsf/viewstate.ts`), parser de partial-response
  JSF con `fast-xml-parser` (`src/jsf/partial-response.ts`) y builder de payloads
  form-urlencoded para postbacks JSF (`src/jsf/payload-builder.ts`).
- **Fase 4 — Discovery del sitio**: ✅ `discoverSiteStructure()` (`src/scraper/discovery.ts`)
  detecta heurísticamente form, inputs ocultos, botones candidatos, tablas, paginadores y
  controles de PDF sin romper si faltan elementos; persistencia de HTML/reporte de debug
  (`src/storage/file-store.ts`, `src/utils/files.ts`) integrada en `scrape`.
- **Fase 5 — Búsqueda inicial vía POST JSF**: ✅ `SearchNavigator` (`src/scraper/navigator.ts`)
  selecciona el botón de búsqueda (`SEARCH_BUTTON_ID` o fallback heurístico sobre el discovery),
  arma el payload `form-urlencoded` (incluyendo los parámetros embebidos en el `onclick` del botón,
  vía `extractOnclickParams` en `src/jsf/payload-builder.ts`) y postea al `action` real del
  formulario. Confirmado contra el sitio real que la búsqueda es un POST/redirect síncrono (no
  AJAX/partial-response); `HttpClient` sigue el redirect y `JsfSession` actualiza el `ViewState`
  con el valor fresco de la página de resultados. `Scraper` (`src/scraper/scraper.ts`) orquesta
  todo el flujo (sesión → discovery → búsqueda), reemplazando la integración temporal de la Fase 4
  en `src/index.ts` (ver [Cómo ejecutar discovery inicial y la búsqueda](#cómo-ejecutar-discovery-inicial-y-la-búsqueda)).
- **Fase 6 — Parseo de resultados**: ✅ `parseDocumentsFromResultsHtml()` (`src/scraper/parser.ts`)
  extrae los documentos reales de la página de resultados (paneles RichFaces `div.rf-p`, no una
  `<table>` clásica), generando id determinístico y nombre de PDF por documento
  (`src/utils/filenames.ts`) y persistencia en JSON/CSV (`src/storage/document-store.ts`).
- **Fase 7 — Paginación JSF**: ✅ `detectPaginator()` (`src/scraper/pagination.ts`) analiza el
  markup real del paginador RichFaces DataScroller (`span.rf-ds`, ids `<paginatorId>_ds_<N>`,
  controles `_ds_next`/`_ds_l`) sin hacer I/O, con auto-detección o id forzado vía
  `PAGINATOR_ID`. `SearchNavigator.getNextPage()` (`src/scraper/navigator.ts`) dispara el AJAX
  real de RichFaces (`javax.faces.partial.ajax=true`, a diferencia del POST/redirect síncrono de
  `searchInitial()` — ver Fase 5), reutilizando el mismo manejo dual HTML/partial-response-XML.
  `Scraper.run()` (`src/scraper/scraper.ts`) implementa el loop de paginación completo con
  deduplicación por `Set` en memoria (sembrado desde `documents.json` de corridas previas para
  soportar re-scrape incremental) y se detiene ante la primera de: `maxPages` alcanzado,
  `maxDocuments` alcanzado, sin página siguiente, página sin documentos, página 100% duplicada, o
  error HTTP no recuperable (sin relanzar, preservando el progreso ya guardado). Nuevas variables
  `RESULTS_TABLE_ID`/`PAGINATOR_ID`/`PAGE_SIZE` (ver tabla de variables de entorno);
  **`PAGE_SIZE` está validado pero todavía no conectado al payload real** — el tamaño de página
  real viaja como un parámetro de `onclick` con clave JSF autogenerada e inestable, y no hay hoy
  forma confiable de identificar cuál sin una investigación puntual futura.

### Pendientes

- **Búsqueda con criterios reales**: hoy `searchInitial()` postea sin completar campos de
  búsqueda (nombre, expediente, etc.); falta pasar criterios reales desde CLI/config.
- **Descarga de PDFs con idempotencia**: descarga de documentos evitando reprocesar los ya
  descargados (verificación de archivo existente/válido).
- **Checkpoints de reanudación real** (`--resume`): hoy el flag existe en el CLI pero no cambia
  el comportamiento; la deduplicación por `documents.json` ya sembrada en el `Set` en memoria es
  un primer paso, falta un checkpoint explícito de "página en la que quedó" por corrida.
- **Cola de reintentos de documentos fallidos**: registro de documentos fallidos y comando
  `retry-failed` con lógica real (hoy es un stub).
- **Resolver a qué parámetro JSF corresponde `PAGE_SIZE` realmente**: requiere inspeccionar el
  onclick del botón de búsqueda contra el sitio real para identificar la key estable (o confirmar
  que no la hay y que hace falta otra estrategia).
