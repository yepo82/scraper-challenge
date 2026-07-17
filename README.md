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

## Roadmap de fases

- **Fase 0 — Scaffolding**: ✅ listo. Estructura del proyecto, configuración vía `zod` +
  `dotenv`, CLI base con `commander` y logger con `pino`.
- **Fase 1 — Cliente HTTP + cookie jar + bootstrap de sesión**: cliente `axios` con
  `axios-cookiejar-support` para sostener cookies de sesión y `ViewState` de JSF.
- **Fase 2 — Navegación de formularios JSF / búsqueda**: construcción y envío de los
  postbacks de PrimeFaces necesarios para ejecutar búsquedas.
- **Fase 3 — Parseo de resultados + paginación**: extracción de resultados con `cheerio` y
  recorrido de páginas.
- **Fase 4 — Descarga de PDFs con idempotencia**: descarga de documentos evitando
  reprocesar los ya descargados.
- **Fase 5 — Persistencia de metadatos (JSON/CSV) + checkpoints**: guardado de metadatos y
  puntos de reanudación.
- **Fase 6 — Manejo de 429 con backoff exponencial/jitter + cola de reintentos**: resiliencia
  ante rate limiting y fallos, con cola de documentos fallidos para reintento.
- **Fase 7 — Comandos reales del CLI**: implementación completa de `scrape` y `retry-failed`
  (por ahora son comandos base sin lógica de scraping).
