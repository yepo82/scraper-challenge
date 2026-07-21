import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpClient } from '../src/http/http-client.js';
import { Scraper } from '../src/scraper/scraper.js';
import { loadDocuments } from '../src/storage/document-store.js';
import type { AppConfig, ScrapeCommandOptions } from '../src/types.js';

let server: http.Server | undefined;
let testDir: string | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
  }
  if (testDir) {
    await fs.rm(testDir, { recursive: true, force: true });
    testDir = undefined;
  }
});

function listen(handler: http.RequestListener): Promise<string> {
  return new Promise((resolve, reject) => {
    server = http.createServer(handler);
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server?.address() as AddressInfo;
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function makeTestDir(): string {
  testDir = path.join(os.tmpdir(), `scraper-challenge-scraper-test-${randomUUID()}`);
  return testDir;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function makeClient(baseUrl: string): HttpClient {
  return new HttpClient({
    baseUrl,
    timeoutMs: 5000,
    maxRetries: 1,
    baseDelayMs: 10,
    maxBackoffMs: 100,
    minTimeBetweenRequestsMs: 0,
  });
}

function makeAppConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    baseUrl: 'http://unused.test',
    outputDir: makeTestDir(),
    maxPages: 3,
    maxDocuments: 30,
    downloadPdfs: false,
    requestTimeoutMs: 5000,
    baseDelayMs: 10,
    maxRetries: 1,
    maxBackoffMs: 100,
    pdfConcurrency: 1,
    logLevel: 'silent',
    ...overrides,
  };
}

function makeOptions(overrides: Partial<ScrapeCommandOptions> = {}): ScrapeCommandOptions {
  return {
    maxPages: 3,
    maxDocuments: 30,
    downloadPdfs: false,
    dryRun: false,
    resume: false,
    ...overrides,
  };
}

// Botón de búsqueda real (ver Fase 5 / tests/navigator.test.ts): dispara la estrategia
// jsfcljs+forward de auto-detección para que discoverSiteStructure() lo elija sin necesitar
// SEARCH_BUTTON_ID.
const REAL_ONCLICK =
  String.raw`jsf.util.chain(this,event,'mojarra.jsfcljs(document.getElementById(\'formBuscador\'),{\'formBuscador:j_idt31\':\'formBuscador:j_idt31\',\'forward\':\'buscar\'},\'\')');return false`;

function initialFormHtml(viewState: string): string {
  return `<!DOCTYPE html><html><body>
<form id="formBuscador" name="formBuscador" method="post" action="/" enctype="application/x-www-form-urlencoded">
<input type="hidden" name="formBuscador" value="formBuscador" />
<input type="hidden" name="javax.faces.ViewState" id="javax.faces.ViewState" value="${viewState}" autocomplete="off" />
<input type="image" src="../images/btn-buscar.png" name="formBuscador:j_idt31" id="formBuscador:j_idt31" onclick="${REAL_ONCLICK.replace(/"/g, '&quot;')}" />
</form>
</body></html>`;
}

// Estructura real de un panel de documento (ver Fase 6 / tests/parser.test.ts): div.rf-p con
// id "...:repeat:N:<sufijo>", dos spans en negrita en el header (recurso, expediente) y pares
// txtbold/valor en el body. expediente único por índice/página garantiza ids de documento
// (generateDocumentId) distintos entre paneles.
function buildPanel(pageNumber: number, index: number): string {
  const expediente = `EXP-P${pageNumber}-${index}`;
  return `
  <div class="rf-p " id="formBuscador:repeat:${index}:panelXYZ">
    <div class="rf-p-hdr " id="formBuscador:repeat:${index}:panelXYZ_header">
      <table><tbody><tr><td>
        <span style="font-weight:bold">Apelación</span><span style="font-weight:bold">${expediente}</span>
      </td></tr></tbody></table>
    </div>
    <div class="rf-p-b " id="formBuscador:repeat:${index}:panelXYZ_body">
      <div class="txtbold">Fecha Resolución:</div><div>01/01/2024</div>
    </div>
  </div>`;
}

function panelsHtml(pageNumber: number, documentCount: number): string {
  return Array.from({ length: documentCount }, (_, index) => buildPanel(pageNumber, index)).join('');
}

function paginatorMarkup(
  paginatorId: string,
  options: { availablePages: number[]; hasMore: boolean },
): string {
  const links = options.availablePages
    .map((pageNumber, idx) =>
      idx === 0
        ? `<span class="rf-ds-nmb-btn rf-ds-act " id="${paginatorId}_ds_${pageNumber}">${pageNumber}</span>`
        : `<a class="rf-ds-nmb-btn " id="${paginatorId}_ds_${pageNumber}">${pageNumber}</a>`,
    )
    .join('');
  const nextLink = options.hasMore
    ? `<a class="rf-ds-btn rf-ds-btn-next" id="${paginatorId}_ds_next">»</a>`
    : '';
  return `<span class="rf-ds " id="${paginatorId}">${links}${nextLink}</span>`;
}

interface PageDef {
  documentCount: number;
  availablePages: number[];
  hasMore: boolean;
}

function pageHtml(pageNumber: number, def: PageDef): string {
  return `<div id="formBuscador:panel">${panelsHtml(pageNumber, def.documentCount)}</div><div class="col-md-12">${paginatorMarkup('formBuscador:data1', def)}</div>`;
}

function buildPartialResponseXml(pageNumber: number, def: PageDef): string {
  return `<?xml version='1.0' encoding='UTF-8'?><partial-response><changes><update id="formBuscador:panel"><![CDATA[<div id="formBuscador:panel">${panelsHtml(pageNumber, def.documentCount)}</div>]]></update><update id="formBuscador:data1"><![CDATA[${paginatorMarkup('formBuscador:data1', def)}]]></update><update id="javax.faces.ViewState"><![CDATA[VS-${pageNumber}]]></update></changes></partial-response>`;
}

interface ScraperServerState {
  ajaxRequestCount: number;
}

function startScraperServer(
  pages: PageDef[],
  opts: { ajaxAlwaysFails?: boolean } = {},
): Promise<{ baseUrl: string; state: ScraperServerState }> {
  const state: ScraperServerState = { ajaxRequestCount: 0 };

  return listen((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(initialFormHtml('VS-0'));
      return;
    }
    if (req.method === 'POST' && req.url === '/') {
      readBody(req)
        .then((body) => {
          const isAjax = body.includes('javax.faces.partial.ajax=true');
          if (!isAjax) {
            res.writeHead(302, { Location: '/resultado' });
            res.end();
            return;
          }

          state.ajaxRequestCount += 1;
          if (opts.ajaxAlwaysFails) {
            res.writeHead(500);
            res.end();
            return;
          }

          const params = new URLSearchParams(body);
          const requestedPage = Number(params.get('formBuscador:data1:page'));
          const def = pages[requestedPage - 1];
          if (!def) {
            res.writeHead(404);
            res.end();
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/xml' });
          res.end(buildPartialResponseXml(requestedPage, def));
        })
        .catch(() => {
          res.writeHead(500);
          res.end();
        });
      return;
    }
    if (req.method === 'GET' && req.url === '/resultado') {
      const def = pages[0];
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html><html><body>
<form id="formBuscador" name="formBuscador" method="post" action="/">
<input type="hidden" name="javax.faces.ViewState" id="javax.faces.ViewState" value="VS-1" autocomplete="off" />
</form>
${pageHtml(1, def)}
</body></html>`);
      return;
    }
    res.writeHead(404);
    res.end();
  }).then((baseUrl) => ({ baseUrl, state }));
}

describe('Scraper.run() pagination loop', () => {
  it('stops when options.maxPages is reached, without requesting further pages', async () => {
    const page1: PageDef = { documentCount: 2, availablePages: [1, 2], hasMore: true };
    const page2: PageDef = { documentCount: 2, availablePages: [1, 2, 3], hasMore: true };
    const { baseUrl, state } = await startScraperServer([page1, page2]);
    const httpClient = makeClient(baseUrl);
    const outputDir = makeTestDir();
    const appConfig = makeAppConfig({ baseUrl, outputDir });
    const scraper = new Scraper(httpClient, appConfig);

    await scraper.run(makeOptions({ maxPages: 2 }));

    const documents = await loadDocuments(outputDir);
    expect(documents).toHaveLength(4); // page1 (2) + page2 (2)
    expect(state.ajaxRequestCount).toBe(1); // solo el salto page1 -> page2, nunca pide page3
  });

  it('stops when options.maxDocuments is reached after fully processing the page that crosses it', async () => {
    const page1: PageDef = { documentCount: 2, availablePages: [1, 2], hasMore: true };
    const page2: PageDef = { documentCount: 2, availablePages: [1, 2, 3], hasMore: true };
    const { baseUrl, state } = await startScraperServer([page1, page2]);
    const httpClient = makeClient(baseUrl);
    const outputDir = makeTestDir();
    const appConfig = makeAppConfig({ baseUrl, outputDir });
    const scraper = new Scraper(httpClient, appConfig);

    await scraper.run(makeOptions({ maxDocuments: 3, maxPages: 10 }));

    const documents = await loadDocuments(outputDir);
    // La página que cruza el límite se guarda completa (sin truncar), no solo hasta llegar a 3.
    expect(documents).toHaveLength(4);
    expect(state.ajaxRequestCount).toBe(1);
  });

  it('stops when getNextPage() returns null (no further page available)', async () => {
    const page1: PageDef = { documentCount: 2, availablePages: [1], hasMore: false };
    const { baseUrl, state } = await startScraperServer([page1]);
    const httpClient = makeClient(baseUrl);
    const outputDir = makeTestDir();
    const appConfig = makeAppConfig({ baseUrl, outputDir });
    const scraper = new Scraper(httpClient, appConfig);

    await scraper.run(makeOptions({ maxPages: 10, maxDocuments: 100 }));

    const documents = await loadDocuments(outputDir);
    expect(documents).toHaveLength(2);
    expect(state.ajaxRequestCount).toBe(0);
  });

  it('stops when a page yields zero documents at all', async () => {
    const page1: PageDef = { documentCount: 0, availablePages: [1, 2], hasMore: true };
    const { baseUrl, state } = await startScraperServer([page1]);
    const httpClient = makeClient(baseUrl);
    const outputDir = makeTestDir();
    const appConfig = makeAppConfig({ baseUrl, outputDir });
    const scraper = new Scraper(httpClient, appConfig);

    await scraper.run(makeOptions({ maxPages: 10, maxDocuments: 100 }));

    const documents = await loadDocuments(outputDir);
    expect(documents).toHaveLength(0);
    expect(state.ajaxRequestCount).toBe(0);
  });

  it('stops when a page yields only already-seen documents, seeding the seen-ids set from documents.json persisted by a previous run', async () => {
    const page1: PageDef = { documentCount: 2, availablePages: [1, 2], hasMore: true };
    const page2: PageDef = { documentCount: 2, availablePages: [1, 2, 3], hasMore: true };
    const outputDir = makeTestDir();

    // Primera corrida: guarda los documentos de la página 1 en output/documents.json.
    {
      const { baseUrl } = await startScraperServer([page1, page2]);
      const httpClient = makeClient(baseUrl);
      const appConfig = makeAppConfig({ baseUrl, outputDir });
      const scraper = new Scraper(httpClient, appConfig);
      await scraper.run(makeOptions({ maxPages: 1 }));
    }
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = undefined;
    }

    const firstRunDocuments = await loadDocuments(outputDir);
    expect(firstRunDocuments).toHaveLength(2);

    // Segunda corrida contra un servidor nuevo que sirve la MISMA página 1 (mismos expedientes,
    // mismos ids de documento): debe detenerse en la página 1 por "todo ya visto", sin siquiera
    // intentar pedir la página 2, a pesar de que el paginador indica que hay más páginas.
    const { baseUrl, state } = await startScraperServer([page1, page2]);
    const httpClient = makeClient(baseUrl);
    const appConfig = makeAppConfig({ baseUrl, outputDir });
    const scraper = new Scraper(httpClient, appConfig);

    await scraper.run(makeOptions({ maxPages: 10, maxDocuments: 100 }));

    expect(state.ajaxRequestCount).toBe(0);
    const documents = await loadDocuments(outputDir);
    expect(documents).toHaveLength(2); // sigue habiendo solo los 2 de la página 1, nada nuevo
  });

  it('stops without rethrowing when an unrecoverable HTTP error occurs while fetching the next page, preserving already-saved progress', async () => {
    const page1: PageDef = { documentCount: 2, availablePages: [1, 2], hasMore: true };
    const { baseUrl } = await startScraperServer([page1], { ajaxAlwaysFails: true });
    const httpClient = makeClient(baseUrl);
    const outputDir = makeTestDir();
    const appConfig = makeAppConfig({ baseUrl, outputDir });
    const scraper = new Scraper(httpClient, appConfig);

    await expect(scraper.run(makeOptions({ maxPages: 10, maxDocuments: 100 }))).resolves.toBeUndefined();

    const documents = await loadDocuments(outputDir);
    expect(documents).toHaveLength(2); // el progreso de la página 1 se conserva
  });
});
