import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { HttpClient } from '../src/http/http-client.js';
import { JsfSession } from '../src/jsf/jsf-session.js';

let server: http.Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = undefined;
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

const REAL_FORM_HTML = `<form id="formBuscador" name="formBuscador" method="post" action="/jurisprudenciaweb/faces/page/inicio.xhtml;jsessionid=cTFT5UCH5-FkkrokJUklf-Eo.jvmr-scjurisp3" enctype="application/x-www-form-urlencoded">
<input type="hidden" name="formBuscador" value="formBuscador" />
<input type="hidden" name="javax.faces.ViewState" id="javax.faces.ViewState" value="4125160013028538766:4987307647222301956" autocomplete="off" />
<input id="formBuscador:tabpanel-value" name="formBuscador:tabpanel-value" type="hidden" value="general" />
</form>`;

function pageWithForm(formHtml: string): string {
  return `<!DOCTYPE html><html><head><title>test</title></head><body>${formHtml}</body></html>`;
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

describe('JsfSession', () => {
  it('initializes from a real form fragment and exposes viewState/formId', async () => {
    const baseUrl = await listen((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(pageWithForm(REAL_FORM_HTML));
    });

    const session = new JsfSession(makeClient(baseUrl), { baseUrl });
    const state = await session.initialize();

    expect(state.formId).toBe('formBuscador');
    expect(state.viewState).toBe('4125160013028538766:4987307647222301956');
    expect(state.formAction).toBeTruthy();
    expect(state.html).toContain('formBuscador');

    expect(session.getViewState()).toBe('4125160013028538766:4987307647222301956');
    expect(session.getFormId()).toBe('formBuscador');
  });

  it('throws when getViewState() is called before initialize()', async () => {
    const baseUrl = await listen((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(pageWithForm(REAL_FORM_HTML));
    });

    const session = new JsfSession(makeClient(baseUrl), { baseUrl });

    expect(() => session.getViewState()).toThrow();
  });

  it('exposes getFormAction() after initialize() resolved to an absolute URL', async () => {
    const baseUrl = await listen((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(pageWithForm(REAL_FORM_HTML));
    });

    const session = new JsfSession(makeClient(baseUrl), { baseUrl });
    const state = await session.initialize();

    // state.formAction guarda el atributo `action` crudo, tal cual está en el HTML (útil para
    // diagnóstico); getFormAction() debe resolverlo a una URL absoluta lista para POSTear.
    // Motivo (hallazgo empírico contra el sitio real, Fase 5): cuando appConfig.baseUrl ya
    // incluye un path (no solo el origin) y se le pasa a axios una URL relativa que empieza con
    // "/", axios NO la trata como "path absoluto reemplazando todo el path de baseURL" —
    // simplemente concatena baseURL + url, duplicando el path y devolviendo un 500 real.
    // Pasar siempre una URL absoluta evita por completo la combinación de axios.
    expect(session.getFormAction()).toBe(new URL(state.formAction, baseUrl).toString());
    expect(session.getFormAction().startsWith('http')).toBe(true);
  });

  it('throws when getFormAction() is called before initialize()', async () => {
    const baseUrl = await listen((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(pageWithForm(REAL_FORM_HTML));
    });

    const session = new JsfSession(makeClient(baseUrl), { baseUrl });

    expect(() => session.getFormAction()).toThrow();
  });

  it('throws when getFormId() is called before initialize()', async () => {
    const baseUrl = await listen((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(pageWithForm(REAL_FORM_HTML));
    });

    const session = new JsfSession(makeClient(baseUrl), { baseUrl });

    expect(() => session.getFormId()).toThrow();
  });

  it('throws a clear error when initialize() finds no ViewState field', async () => {
    const baseUrl = await listen((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(pageWithForm('<form id="formBuscador"><input type="text" name="q" /></form>'));
    });

    const session = new JsfSession(makeClient(baseUrl), { baseUrl });

    await expect(session.initialize()).rejects.toThrow(/ViewState/i);
  });

  it('updateFromResponse() with a partial-response XML body updates the stored ViewState', async () => {
    const baseUrl = await listen((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(pageWithForm(REAL_FORM_HTML));
    });

    const session = new JsfSession(makeClient(baseUrl), { baseUrl });
    await session.initialize();

    const xml = `<?xml version='1.0' encoding='UTF-8'?>
<partial-response><changes><update id="javax.faces.ViewState"><![CDATA[4125160013028538766:4987307647222301957]]></update></changes></partial-response>`;

    session.updateFromResponse(xml);

    expect(session.getViewState()).toBe('4125160013028538766:4987307647222301957');
  });

  it('updateFromResponse() with a full HTML body updates the stored ViewState', async () => {
    const baseUrl = await listen((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(pageWithForm(REAL_FORM_HTML));
    });

    const session = new JsfSession(makeClient(baseUrl), { baseUrl });
    await session.initialize();

    const updatedFormHtml = REAL_FORM_HTML.replace(
      '4125160013028538766:4987307647222301956',
      '4125160013028538766:4987307647222301958',
    );

    session.updateFromResponse(pageWithForm(updatedFormHtml));

    expect(session.getViewState()).toBe('4125160013028538766:4987307647222301958');
  });

  it('updateFromResponse() with a full XHTML body prefixed by an <?xml ...?> prolog updates the stored ViewState (not misread as a partial-response)', async () => {
    // Hallazgo empírico contra el sitio real (Fase 5): inicio.xhtml y resultado.xhtml son XHTML
    // real y arrancan con `<?xml version="1.0" encoding="UTF-8"?>` antes del <!DOCTYPE html>.
    // Antes de este fix, updateFromResponse() confundía esto con un partial-response de JSF y
    // fallaba en extraer el ViewState contra el sitio real.
    const baseUrl = await listen((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(pageWithForm(REAL_FORM_HTML));
    });

    const session = new JsfSession(makeClient(baseUrl), { baseUrl });
    await session.initialize();

    const updatedFormHtml = REAL_FORM_HTML.replace(
      '4125160013028538766:4987307647222301956',
      '4125160013028538766:4987307647222301959',
    );
    const xhtmlWithProlog = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">\n${pageWithForm(updatedFormHtml)}`;

    session.updateFromResponse(xhtmlWithProlog);

    expect(session.getViewState()).toBe('4125160013028538766:4987307647222301959');
  });

  it('updateFromResponse() throws and leaves the previous ViewState intact when nothing extractable is found', async () => {
    const baseUrl = await listen((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(pageWithForm(REAL_FORM_HTML));
    });

    const session = new JsfSession(makeClient(baseUrl), { baseUrl });
    await session.initialize();

    const originalViewState = session.getViewState();

    expect(() => session.updateFromResponse('<html><body>no view state here</body></html>')).toThrow();
    expect(session.getViewState()).toBe(originalViewState);
  });
});
