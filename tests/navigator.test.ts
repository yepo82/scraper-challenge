import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpClient } from '../src/http/http-client.js';
import { JsfSession } from '../src/jsf/jsf-session.js';
import { discoverSiteStructure } from '../src/scraper/discovery.js';
import { SearchNavigator } from '../src/scraper/navigator.js';
import type { SearchPageResult, SiteDiscoveryReport } from '../src/types.js';

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
  testDir = path.join(os.tmpdir(), `scraper-challenge-navigator-test-${randomUUID()}`);
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

// Bytes reales del botón de búsqueda del sitio, ver Fase 5 / tests/payload-builder.test.ts.
const REAL_ONCLICK =
  String.raw`jsf.util.chain(this,event,'this.form.target=\'_self\';RichFaces.$(\'panelState\').show();','mojarra.jsfcljs(document.getElementById(\'formBuscador\'),{\'formBuscador:j_idt31\':\'formBuscador:j_idt31\',\'forward\':\'buscar\',\'busqueda\':\'especializada\',\'formBuscador:j_idt34\':\'21\',\'formBuscador:j_idt35\':\'DESC\',\'formBuscador:j_idt36\':\'Principal\',\'formBuscador:j_idt37\':\'1\'},\'\')');return false`;

function initialFormHtml(viewState: string, formAction = '/'): string {
  return `<!DOCTYPE html><html><head><title>test</title></head><body>
<form id="formBuscador" name="formBuscador" method="post" action="${formAction}" enctype="application/x-www-form-urlencoded">
<input type="hidden" name="formBuscador" value="formBuscador" />
<input type="hidden" name="javax.faces.ViewState" id="javax.faces.ViewState" value="${viewState}" autocomplete="off" />
<input type="image" src="../images/btn-buscar.png" name="formBuscador:j_idt31" id="formBuscador:j_idt31" onclick="${REAL_ONCLICK.replace(/"/g, '&quot;')}" />
</form>
</body></html>`;
}

function resultadoHtmlWithResults(viewState: string): string {
  return `<!DOCTYPE html><html><body>
<form id="formBuscador" name="formBuscador" method="post" action="/resultado">
<input type="hidden" name="formBuscador" value="formBuscador" />
<input type="hidden" name="javax.faces.ViewState" id="javax.faces.ViewState" value="${viewState}" autocomplete="off" />
</form>
<div id="formBuscador:panel">
<table id="formBuscador:tablaResultados">
<tr><th>Expediente</th><th>Fecha</th></tr>
<tr><td>001-2024</td><td>2024-01-01</td></tr>
<tr><td>002-2024</td><td>2024-01-02</td></tr>
</table>
</div>
</body></html>`;
}

function resultadoHtmlNoResults(viewState: string): string {
  return `<!DOCTYPE html><html><body>
<form id="formBuscador" name="formBuscador" method="post" action="/resultado">
<input type="hidden" name="formBuscador" value="formBuscador" />
<input type="hidden" name="javax.faces.ViewState" id="javax.faces.ViewState" value="${viewState}" autocomplete="off" />
</form>
<div id="formBuscador:panel"></div>
</body></html>`;
}

interface ServerState {
  capturedBody?: string;
  cookieSet: boolean;
  resultadoHtml: string;
}

function startFullFlowServer(resultadoHtml: string): Promise<{ baseUrl: string; state: ServerState }> {
  const state: ServerState = { cookieSet: false, resultadoHtml };

  return listen((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(initialFormHtml('VS-INITIAL'));
      return;
    }
    if (req.method === 'POST' && req.url === '/') {
      readBody(req)
        .then((body) => {
          state.capturedBody = body;
          const headers: Record<string, string> = { Location: '/resultado' };
          if (!state.cookieSet) {
            headers['Set-Cookie'] = 'jsessionid=nav-test-session';
            state.cookieSet = true;
          }
          res.writeHead(302, headers);
          res.end();
        })
        .catch(() => {
          res.writeHead(500);
          res.end();
        });
      return;
    }
    if (req.method === 'GET' && req.url === '/resultado') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(state.resultadoHtml);
      return;
    }
    res.writeHead(404);
    res.end();
  }).then((baseUrl) => ({ baseUrl, state }));
}

async function buildInitializedSession(baseUrl: string): Promise<{ session: JsfSession; discoveryReport: SiteDiscoveryReport }> {
  const httpClient = makeClient(baseUrl);
  const session = new JsfSession(httpClient, { baseUrl });
  const initialState = await session.initialize();
  const discoveryReport = discoverSiteStructure(initialState.html);
  return { session, discoveryReport };
}

describe('SearchNavigator.searchInitial()', () => {
  it('returns a SearchPageResult with the fresh post-search ViewState and non-empty html/rawResponse', async () => {
    const { baseUrl, state } = await startFullFlowServer(resultadoHtmlWithResults('VS-RESULT'));
    const httpClient = makeClient(baseUrl);
    const { session, discoveryReport } = await buildInitializedSession(baseUrl);
    const outputDir = makeTestDir();

    const navigator = new SearchNavigator(session, httpClient, { outputDir }, discoveryReport);
    const result = await navigator.searchInitial();

    expect(result.pageNumber).toBe(1);
    expect(result.viewState).toBe('VS-RESULT');
    expect(result.html.length).toBeGreaterThan(0);
    expect(result.rawResponse.length).toBeGreaterThan(0);
    expect(state.capturedBody).toBeTruthy();
  });

  it('POST body includes the onclick-extracted params (forward, busqueda, self-reference key)', async () => {
    const { baseUrl, state } = await startFullFlowServer(resultadoHtmlWithResults('VS-RESULT'));
    const httpClient = makeClient(baseUrl);
    const { session, discoveryReport } = await buildInitializedSession(baseUrl);
    const outputDir = makeTestDir();

    const navigator = new SearchNavigator(session, httpClient, { outputDir }, discoveryReport);
    await navigator.searchInitial();

    const posted = new URLSearchParams(state.capturedBody);
    expect(posted.get('forward')).toBe('buscar');
    expect(posted.get('busqueda')).toBe('especializada');
    expect(posted.get('formBuscador:j_idt31')).toBe('formBuscador:j_idt31');
  });

  it('mutates the session so getViewState() reflects the updated value after searchInitial() returns', async () => {
    const { baseUrl } = await startFullFlowServer(resultadoHtmlWithResults('VS-RESULT'));
    const httpClient = makeClient(baseUrl);
    const { session, discoveryReport } = await buildInitializedSession(baseUrl);
    const outputDir = makeTestDir();

    const navigator = new SearchNavigator(session, httpClient, { outputDir }, discoveryReport);
    await navigator.searchInitial();

    expect(session.getViewState()).toBe('VS-RESULT');
  });

  it('saves output/debug/search-response.xml and output/debug/page-1.html with the expected content', async () => {
    const { baseUrl } = await startFullFlowServer(resultadoHtmlWithResults('VS-RESULT'));
    const httpClient = makeClient(baseUrl);
    const { session, discoveryReport } = await buildInitializedSession(baseUrl);
    const outputDir = makeTestDir();

    const navigator = new SearchNavigator(session, httpClient, { outputDir }, discoveryReport);
    const result = await navigator.searchInitial();

    const searchResponsePath = path.join(outputDir, 'debug', 'search-response.xml');
    const pageHtmlPath = path.join(outputDir, 'debug', 'page-1.html');

    const savedResponse = await fs.readFile(searchResponsePath, 'utf-8');
    const savedPage = await fs.readFile(pageHtmlPath, 'utf-8');

    expect(savedResponse).toBe(result.rawResponse);
    expect(savedPage).toBe(result.html);
  });

  it('resolves successfully without throwing when the results page has no populated table (no-results scenario)', async () => {
    const { baseUrl } = await startFullFlowServer(resultadoHtmlNoResults('VS-RESULT-EMPTY'));
    const httpClient = makeClient(baseUrl);
    const { session, discoveryReport } = await buildInitializedSession(baseUrl);
    const outputDir = makeTestDir();

    const navigator = new SearchNavigator(session, httpClient, { outputDir }, discoveryReport);

    await expect(navigator.searchInitial()).resolves.toMatchObject({
      pageNumber: 1,
      viewState: 'VS-RESULT-EMPTY',
    });
  });

  it('SEARCH_BUTTON_ID override selects the exact configured button, ignoring auto-detection candidates', async () => {
    const { baseUrl, state } = await startFullFlowServer(resultadoHtmlWithResults('VS-RESULT'));
    const httpClient = makeClient(baseUrl);
    const session = new JsfSession(httpClient, { baseUrl });
    await session.initialize();
    const outputDir = makeTestDir();

    // El decoy calzaría con la estrategia 1 de auto-detección (jsfcljs + forward); el override
    // debe ganarle igual, probando que SEARCH_BUTTON_ID no es solo un desempate sino una fuente
    // de verdad distinta.
    const discoveryReport: SiteDiscoveryReport = {
      formId: 'formBuscador',
      hiddenInputs: {},
      candidateSearchButtons: [
        {
          id: 'formBuscador:decoy',
          name: 'formBuscador:decoy',
          onclick:
            "mojarra.jsfcljs(document.getElementById('formBuscador'),{'formBuscador:decoy':'formBuscador:decoy','forward':'buscar'},'')",
        },
        {
          id: 'formBuscador:target',
          name: 'formBuscador:target',
          onclick:
            "mojarra.jsfcljs(document.getElementById('formBuscador'),{'formBuscador:target':'formBuscador:target','forward':'buscar','customFlag':'yes'},'')",
        },
      ],
      candidateTables: [],
      candidatePaginators: [],
      candidatePdfControls: [],
    };

    const navigator = new SearchNavigator(
      session,
      httpClient,
      { outputDir, searchButtonId: 'formBuscador:target' },
      discoveryReport,
    );
    await navigator.searchInitial();

    const posted = new URLSearchParams(state.capturedBody);
    expect(posted.get('customFlag')).toBe('yes');
    expect(posted.get('formBuscador:target')).toBe('formBuscador:target');
    expect(posted.has('formBuscador:decoy')).toBe(false);
  });

  it('throws a clear error when SEARCH_BUTTON_ID is set to an id not found among discovery candidates', async () => {
    const { baseUrl } = await startFullFlowServer(resultadoHtmlWithResults('VS-RESULT'));
    const httpClient = makeClient(baseUrl);
    const session = new JsfSession(httpClient, { baseUrl });
    await session.initialize();
    const outputDir = makeTestDir();

    const discoveryReport: SiteDiscoveryReport = {
      formId: 'formBuscador',
      hiddenInputs: {},
      candidateSearchButtons: [{ id: 'formBuscador:j_idt31', onclick: REAL_ONCLICK }],
      candidateTables: [],
      candidatePaginators: [],
      candidatePdfControls: [],
    };

    const navigator = new SearchNavigator(
      session,
      httpClient,
      { outputDir, searchButtonId: 'formBuscador:doesNotExist' },
      discoveryReport,
    );

    await expect(navigator.searchInitial()).rejects.toThrow(/formBuscador:doesNotExist/);
  });

  it('strips the ;jsessionid=... matrix parameter from the form action before POSTing (real site returns 500 otherwise)', async () => {
    // Hallazgo empírico contra el sitio real (Fase 5): el `action` del form real embebe
    // ";jsessionid=..." como matrix parameter. Postear literalmente a esa URL devuelve 500 en
    // el sitio real aunque la cookie de sesión ya sea válida; postear a la misma ruta sin ese
    // segmento funciona (302). El cliente ya persiste la sesión vía cookie (ver HttpClient), así
    // que el segmento ;jsessionid=... es puramente redundante y hay que descartarlo.
    let receivedUrl: string | undefined;

    server = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(initialFormHtml('VS-INITIAL', '/;jsessionid=ABC123.node1'));
        return;
      }
      if (req.method === 'POST') {
        receivedUrl = req.url;
        readBody(req)
          .then(() => {
            res.writeHead(302, { Location: '/resultado' });
            res.end();
          })
          .catch(() => {
            res.writeHead(500);
            res.end();
          });
        return;
      }
      if (req.method === 'GET' && req.url === '/resultado') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(resultadoHtmlWithResults('VS-RESULT'));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    const baseUrl = await new Promise<string>((resolve, reject) => {
      server?.on('error', reject);
      server?.listen(0, '127.0.0.1', () => {
        const address = server?.address() as AddressInfo;
        resolve(`http://127.0.0.1:${address.port}`);
      });
    });

    const httpClient = makeClient(baseUrl);
    const { session, discoveryReport } = await buildInitializedSession(baseUrl);
    const outputDir = makeTestDir();

    const navigator = new SearchNavigator(session, httpClient, { outputDir }, discoveryReport);
    await navigator.searchInitial();

    expect(receivedUrl).not.toContain('jsessionid');
  });

  it('extracts usable HTML from a partial-response XML body if the POST ever responds AJAX-shaped', async () => {
    // No hay endpoint real que dispare esta rama hoy (Fase 5 confirmó POST/redirect síncrono),
    // pero el módulo debe seguir siendo correcto si algún día el POST responde partial-response.
    const baseUrl = await listen((req, res) => {
      if (req.method === 'GET' && req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(initialFormHtml('VS-INITIAL'));
        return;
      }
      if (req.method === 'POST' && req.url === '/') {
        const xml = `<?xml version='1.0' encoding='UTF-8'?><partial-response><changes><update id="formBuscador:panel"><![CDATA[<div>resultado ajax</div>]]></update><update id="javax.faces.ViewState"><![CDATA[VS-AJAX]]></update></changes></partial-response>`;
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end(xml);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    const httpClient = makeClient(baseUrl);
    const { session, discoveryReport } = await buildInitializedSession(baseUrl);
    const outputDir = makeTestDir();

    const navigator = new SearchNavigator(session, httpClient, { outputDir }, discoveryReport);
    const result = await navigator.searchInitial();

    expect(result.html).toContain('resultado ajax');
    expect(result.html).not.toContain('partial-response');
    expect(result.viewState).toBe('VS-AJAX');
  });

  it('throws a clear error when there is no viable search button candidate and no override configured', async () => {
    const { baseUrl } = await startFullFlowServer(resultadoHtmlWithResults('VS-RESULT'));
    const httpClient = makeClient(baseUrl);
    const session = new JsfSession(httpClient, { baseUrl });
    await session.initialize();
    const outputDir = makeTestDir();

    const discoveryReport: SiteDiscoveryReport = {
      formId: 'formBuscador',
      hiddenInputs: {},
      candidateSearchButtons: [],
      candidateTables: [],
      candidatePaginators: [],
      candidatePdfControls: [],
    };

    const navigator = new SearchNavigator(session, httpClient, { outputDir }, discoveryReport);

    await expect(navigator.searchInitial()).rejects.toThrow(/SEARCH_BUTTON_ID/);
  });
});

// Markup real del paginador RichFaces DataScroller (ver Fase 7 / tests/pagination.test.ts),
// parametrizado por paginatorId para poder construir fixtures con ids distintos.
function paginatorHtml(paginatorId: string, options: { hasNext?: boolean } = {}): string {
  const hasNext = options.hasNext ?? true;
  const nextLink = hasNext
    ? `<a class="rf-ds-btn rf-ds-btn-next" href="javascript:void(0);" id="${paginatorId}_ds_next">»</a>`
    : '';
  return `<span class="rf-ds " id="${paginatorId}"><span class="rf-ds-nmb-btn rf-ds-act " id="${paginatorId}_ds_1">1</span><a class="rf-ds-nmb-btn " id="${paginatorId}_ds_2">2</a><a class="rf-ds-nmb-btn " id="${paginatorId}_ds_3">3</a>${nextLink}</span>`;
}

function pageOneHtmlWithPaginator(paginatorId: string, options: { hasNext?: boolean } = {}): string {
  return `<!DOCTYPE html><html><body>
<div id="formBuscador:panel">
<div class="rf-p" id="formBuscador:panel:repeat:0:abc">documento página 1</div>
</div>
<div class="col-md-12">${paginatorHtml(paginatorId, options)}</div>
</body></html>`;
}

function makeCurrentPage(overrides: Partial<SearchPageResult> = {}): SearchPageResult {
  return {
    pageNumber: 1,
    html: pageOneHtmlWithPaginator('formBuscador:data1'),
    rawResponse: '<html></html>',
    viewState: 'VS-RESULT',
    discoveredAt: new Date().toISOString(),
    ...overrides,
  };
}

interface PaginationServerState {
  requestCount: number;
  capturedBody?: string;
}

function startPaginationServer(partialResponseXml: string): Promise<{ baseUrl: string; state: PaginationServerState }> {
  const state: PaginationServerState = { requestCount: 0 };

  return listen((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(initialFormHtml('VS-INITIAL'));
      return;
    }
    if (req.method === 'POST' && req.url === '/') {
      state.requestCount += 1;
      readBody(req)
        .then((body) => {
          state.capturedBody = body;
          res.writeHead(200, { 'Content-Type': 'text/xml' });
          res.end(partialResponseXml);
        })
        .catch(() => {
          res.writeHead(500);
          res.end();
        });
      return;
    }
    res.writeHead(404);
    res.end();
  }).then((baseUrl) => ({ baseUrl, state }));
}

function buildPartialResponseXml(options: {
  renderId: string;
  panelContent: string;
  viewState: string;
}): string {
  return `<?xml version='1.0' encoding='UTF-8'?><partial-response><changes><update id="${options.renderId}"><![CDATA[${options.panelContent}]]></update><update id="javax.faces.ViewState"><![CDATA[${options.viewState}]]></update></changes></partial-response>`;
}

describe('SearchNavigator.getNextPage()', () => {
  it('posts a JSF AJAX request and returns a SearchPageResult with incremented pageNumber, fresh ViewState and html from the partial-response', async () => {
    const xml = buildPartialResponseXml({
      renderId: 'formBuscador:panel',
      panelContent: '<div class="rf-p" id="formBuscador:panel:repeat:0:xyz">documento página 2</div>',
      viewState: 'VS-PAGE-2',
    });
    const { baseUrl, state } = await startPaginationServer(xml);
    const httpClient = makeClient(baseUrl);
    const { session } = await buildInitializedSession(baseUrl);
    const outputDir = makeTestDir();

    const navigator = new SearchNavigator(session, httpClient, { outputDir }, {
      formId: 'formBuscador',
      hiddenInputs: {},
      candidateSearchButtons: [],
      candidateTables: [],
      candidatePaginators: [],
      candidatePdfControls: [],
    });

    const currentPage = makeCurrentPage();
    const result = await navigator.getNextPage(currentPage);

    expect(result).not.toBeNull();
    expect(result?.pageNumber).toBe(2);
    expect(result?.viewState).toBe('VS-PAGE-2');
    expect(result?.html).toContain('documento página 2');
    expect(state.requestCount).toBe(1);
  });

  it('POST body contains javax.faces.partial.ajax=true, the correct source, and the <paginatorId>:page param', async () => {
    const xml = buildPartialResponseXml({
      renderId: 'formBuscador:panel',
      panelContent: '<div>página 2</div>',
      viewState: 'VS-PAGE-2',
    });
    const { baseUrl, state } = await startPaginationServer(xml);
    const httpClient = makeClient(baseUrl);
    const { session } = await buildInitializedSession(baseUrl);
    const outputDir = makeTestDir();

    const navigator = new SearchNavigator(session, httpClient, { outputDir }, {
      formId: 'formBuscador',
      hiddenInputs: {},
      candidateSearchButtons: [],
      candidateTables: [],
      candidatePaginators: [],
      candidatePdfControls: [],
    });

    await navigator.getNextPage(makeCurrentPage());

    const posted = new URLSearchParams(state.capturedBody);
    expect(posted.get('javax.faces.partial.ajax')).toBe('true');
    expect(posted.get('javax.faces.source')).toBe('formBuscador:data1');
    expect(posted.get('formBuscador:data1:page')).toBe('2');
  });

  it('returns null and makes no request when currentPage.html has no paginator at all', async () => {
    const xml = buildPartialResponseXml({
      renderId: 'formBuscador:panel',
      panelContent: '<div>no debería llegar acá</div>',
      viewState: 'VS-PAGE-2',
    });
    const { baseUrl, state } = await startPaginationServer(xml);
    const httpClient = makeClient(baseUrl);
    const { session } = await buildInitializedSession(baseUrl);
    const outputDir = makeTestDir();

    const navigator = new SearchNavigator(session, httpClient, { outputDir }, {
      formId: 'formBuscador',
      hiddenInputs: {},
      candidateSearchButtons: [],
      candidateTables: [],
      candidatePaginators: [],
      candidatePdfControls: [],
    });

    const currentPage = makeCurrentPage({ html: '<html><body><div id="formBuscador:panel">sin paginador</div></body></html>' });
    const result = await navigator.getNextPage(currentPage);

    expect(result).toBeNull();
    expect(state.requestCount).toBe(0);
  });

  it('returns null and makes no request when the next page is not in availablePages and hasMorePages is false', async () => {
    const xml = buildPartialResponseXml({
      renderId: 'formBuscador:panel',
      panelContent: '<div>no debería llegar acá</div>',
      viewState: 'VS-PAGE-2',
    });
    const { baseUrl, state } = await startPaginationServer(xml);
    const httpClient = makeClient(baseUrl);
    const { session } = await buildInitializedSession(baseUrl);
    const outputDir = makeTestDir();

    const navigator = new SearchNavigator(session, httpClient, { outputDir }, {
      formId: 'formBuscador',
      hiddenInputs: {},
      candidateSearchButtons: [],
      candidateTables: [],
      candidatePaginators: [],
      candidatePdfControls: [],
    });

    // pageNumber 3 con solo 3 páginas listadas y sin next/last: la página 4 no existe.
    const currentPage = makeCurrentPage({
      pageNumber: 3,
      html: pageOneHtmlWithPaginator('formBuscador:data1', { hasNext: false }),
    });
    const result = await navigator.getNextPage(currentPage);

    expect(result).toBeNull();
    expect(state.requestCount).toBe(0);
  });

  it('PAGINATOR_ID/RESULTS_TABLE_ID overrides take precedence over auto-detection', async () => {
    const xml = buildPartialResponseXml({
      renderId: 'formBuscador:customPanel',
      panelContent: '<div>página 2 vía override</div>',
      viewState: 'VS-PAGE-2',
    });
    const { baseUrl, state } = await startPaginationServer(xml);
    const httpClient = makeClient(baseUrl);
    const { session } = await buildInitializedSession(baseUrl);
    const outputDir = makeTestDir();

    const navigator = new SearchNavigator(
      session,
      httpClient,
      { outputDir, paginatorId: 'formBuscador:data2', resultsTableId: 'formBuscador:customPanel' },
      {
        formId: 'formBuscador',
        hiddenInputs: {},
        candidateSearchButtons: [],
        candidateTables: [],
        candidatePaginators: [],
        candidatePdfControls: [],
      },
    );

    // Fixture con dos paginadores distintos: la auto-detección elegiría "data1" (primero en el
    // documento); el override debe forzar "data2" igual.
    const currentPage = makeCurrentPage({
      html: `<!DOCTYPE html><html><body>
<div class="col-md-12">${paginatorHtml('formBuscador:data1')}</div>
<div class="col-md-12">${paginatorHtml('formBuscador:data2')}</div>
</body></html>`,
    });

    await navigator.getNextPage(currentPage);

    const posted = new URLSearchParams(state.capturedBody);
    expect(posted.get('javax.faces.source')).toBe('formBuscador:data2');
    expect(posted.get('javax.faces.partial.render')).toBe('formBuscador:customPanel formBuscador:data2');
    expect(posted.get('formBuscador:data2:page')).toBe('2');
    expect(posted.has('formBuscador:data1:page')).toBe(false);
  });

  it('saves output/debug/page-2.html with the extracted html content', async () => {
    const xml = buildPartialResponseXml({
      renderId: 'formBuscador:panel',
      panelContent: '<div>contenido guardado de la página 2</div>',
      viewState: 'VS-PAGE-2',
    });
    const { baseUrl } = await startPaginationServer(xml);
    const httpClient = makeClient(baseUrl);
    const { session } = await buildInitializedSession(baseUrl);
    const outputDir = makeTestDir();

    const navigator = new SearchNavigator(session, httpClient, { outputDir }, {
      formId: 'formBuscador',
      hiddenInputs: {},
      candidateSearchButtons: [],
      candidateTables: [],
      candidatePaginators: [],
      candidatePdfControls: [],
    });

    const result = await navigator.getNextPage(makeCurrentPage());

    const pageHtmlPath = path.join(outputDir, 'debug', 'page-2.html');
    const savedPage = await fs.readFile(pageHtmlPath, 'utf-8');

    expect(savedPage).toBe(result?.html);
    expect(savedPage).toContain('contenido guardado de la página 2');
  });
});
