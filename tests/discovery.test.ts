import { describe, expect, it } from 'vitest';
import { discoverSiteStructure } from '../src/scraper/discovery.js';

// Fixture verificado contra el sitio real (jurisprudencia.pj.gob.pe): dos de los inputs
// ocultos no tienen atributo `value`, cheerio devuelve `undefined` para esos casos y
// discoverSiteStructure() debe normalizarlos a '' en vez de "undefined" o crashear.
const REAL_FORM_HTML = `<form id="formBuscador" name="formBuscador" method="post" action="/jurisprudenciaweb/faces/page/inicio.xhtml;jsessionid=abc123" enctype="application/x-www-form-urlencoded">
<input type="hidden" name="formBuscador" value="formBuscador" />
<input type="hidden" name="javax.faces.ViewState" id="javax.faces.ViewState" value="4125160013028538766:4987307647222301956" autocomplete="off" />
<input id="formBuscador:tabpanel-value" name="formBuscador:tabpanel-value" type="hidden" value="general" />
<input id="formBuscador:buPretensionValue" name="formBuscador:buPretensionValue" type="hidden" />
<input id="formBuscador:buPalabraClaveValue" name="formBuscador:buPalabraClaveValue" type="hidden" />
<input id="formBuscador:txtBusqueda" type="text" name="formBuscador:txtBusqueda" value="" class="form-control" title="Ingrese el texto a buscar" />
<input type="image" src="../images/btn-buscar.png" name="formBuscador:j_idt31" onclick="jsf.util.chain(this,event,'RichFaces.$(&quot;panelState&quot;).show();','mojarra.jsfcljs(document.getElementById(&quot;formBuscador&quot;),{&quot;formBuscador:j_idt31&quot;:&quot;formBuscador:j_idt31&quot;,&quot;forward&quot;:&quot;buscar&quot;},&quot;&quot;)');return false" />
</form>`;

function pageWithBody(bodyHtml: string): string {
  return `<html><body>${bodyHtml}</body></html>`;
}

describe('discoverSiteStructure', () => {
  it('detects the main form and its hidden inputs from the real fixture', () => {
    const report = discoverSiteStructure(pageWithBody(REAL_FORM_HTML));

    expect(report.formId).toBe('formBuscador');
    expect(report.hiddenInputs.formBuscador).toBe('formBuscador');
    expect(report.hiddenInputs['javax.faces.ViewState']).toBe(
      '4125160013028538766:4987307647222301956',
    );
    expect(report.hiddenInputs['formBuscador:tabpanel-value']).toBe('general');
    // Sin atributo `value` en el HTML real: debe normalizarse a '', no 'undefined'.
    expect(report.hiddenInputs['formBuscador:buPretensionValue']).toBe('');
    expect(report.hiddenInputs['formBuscador:buPalabraClaveValue']).toBe('');
  });

  it('detects the image search button as a candidate with its onclick payload', () => {
    const report = discoverSiteStructure(pageWithBody(REAL_FORM_HTML));

    const searchButton = report.candidateSearchButtons.find(
      (button) => button.name === 'formBuscador:j_idt31',
    );

    expect(searchButton).toBeDefined();
    expect(searchButton?.onclick).toContain('mojarra.jsfcljs');
  });

  it('never throws and returns an all-empty report for minimal HTML with no form', () => {
    const html = '<html><body></body></html>';

    expect(() => discoverSiteStructure(html)).not.toThrow();

    const report = discoverSiteStructure(html);
    expect(report.formId).toBeNull();
    expect(report.hiddenInputs).toEqual({});
    expect(report.candidateSearchButtons).toEqual([]);
    expect(report.candidateTables).toEqual([]);
    expect(report.candidatePaginators).toEqual([]);
    expect(report.candidatePdfControls).toEqual([]);
  });

  it('never throws for completely empty HTML', () => {
    expect(() => discoverSiteStructure('')).not.toThrow();
    const report = discoverSiteStructure('');
    expect(report.formId).toBeNull();
  });

  it('reports headers and rowCount for a table with <th> header cells', () => {
    const html = pageWithBody(`
      <table id="resultTable">
        <thead>
          <tr><th>Expediente</th><th>Fecha</th></tr>
        </thead>
        <tbody>
          <tr><td>001-2024</td><td>2024-01-01</td></tr>
          <tr><td>002-2024</td><td>2024-01-02</td></tr>
        </tbody>
      </table>
    `);

    const report = discoverSiteStructure(html);
    const table = report.candidateTables.find((t) => t.id === 'resultTable');

    expect(table).toBeDefined();
    expect(table?.headers).toEqual(['Expediente', 'Fecha']);
    expect(table?.rowCount).toBe(3);
  });

  it('reports an empty headers array (no throw) for a layout table without <th>, matching the real site', () => {
    const html = pageWithBody(`
      <table id="layoutTable">
        <tr><td>panel content</td></tr>
        <tr><td>more panel content</td></tr>
      </table>
    `);

    expect(() => discoverSiteStructure(html)).not.toThrow();

    const report = discoverSiteStructure(html);
    const table = report.candidateTables.find((t) => t.id === 'layoutTable');

    expect(table).toBeDefined();
    expect(table?.headers).toEqual([]);
    expect(table?.rowCount).toBe(2);
  });

  it('detects RichFaces-style paginator elements by class', () => {
    const html = pageWithBody('<div id="pgr1" class="rf-ds rf-ds-pgr">1 2 3</div>');

    const report = discoverSiteStructure(html);

    expect(report.candidatePaginators.some((p) => p.id === 'pgr1')).toBe(true);
  });

  it('detects PDF download links by href', () => {
    const html = pageWithBody('<a href="/docs/resolucion-123.pdf">Descargar PDF</a>');

    const report = discoverSiteStructure(html);
    const pdfControl = report.candidatePdfControls.find(
      (control) => control.href === '/docs/resolucion-123.pdf',
    );

    expect(pdfControl).toBeDefined();
    expect(pdfControl?.text).toBe('Descargar PDF');
  });

  it('never throws across a page combining all fixture pieces', () => {
    const combined = pageWithBody(
      REAL_FORM_HTML +
        '<table id="t1"><tr><th>H</th></tr><tr><td>d</td></tr></table>' +
        '<div class="ui-paginator">paginator</div>' +
        '<a href="/x.pdf">pdf</a>',
    );

    expect(() => discoverSiteStructure(combined)).not.toThrow();
  });
});
