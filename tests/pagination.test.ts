import { describe, expect, it } from 'vitest';
import { detectPaginator } from '../src/scraper/pagination.js';

// Markup real capturado del sitio (página de resultados "civil", 10 documentos): RichFaces
// DataScroller con 5 páginas visibles y controles "next"/"last" (hay más páginas más allá de
// las 5 numeradas). El <script> inline se omite: detectPaginator() solo lee ids/clases del
// span/a, no ejecuta ni parsea JS.
const REAL_PAGINATOR_HTML = `<div class="col-md-12"><span class="rf-ds " id="formBuscador:data1"><span class="rf-ds-nmb-btn rf-ds-act " id="formBuscador:data1_ds_1">1</span><a class="rf-ds-nmb-btn " href="javascript:void(0);" id="formBuscador:data1_ds_2">2</a><a class="rf-ds-nmb-btn " href="javascript:void(0);" id="formBuscador:data1_ds_3">3</a><a class="rf-ds-nmb-btn " href="javascript:void(0);" id="formBuscador:data1_ds_4">4</a><a class="rf-ds-nmb-btn " href="javascript:void(0);" id="formBuscador:data1_ds_5">5</a><a class="rf-ds-btn rf-ds-btn-next" href="javascript:void(0);" id="formBuscador:data1_ds_next">»</a><a class="rf-ds-btn rf-ds-btn-last" href="javascript:void(0);" id="formBuscador:data1_ds_l">»»</a></span></div>`;

function pageWithBody(bodyHtml: string): string {
  return `<html><body>${bodyHtml}</body></html>`;
}

describe('detectPaginator', () => {
  it('extracts paginatorId, availablePages and hasMorePages from the real fixture', () => {
    const info = detectPaginator(pageWithBody(REAL_PAGINATOR_HTML));

    expect(info).toEqual({
      paginatorId: 'formBuscador:data1',
      availablePages: [1, 2, 3, 4, 5],
      hasMorePages: true,
    });
  });

  it('reports hasMorePages: false when there is no next/last control (all pages already shown)', () => {
    const html = `<span class="rf-ds " id="formBuscador:data1"><span class="rf-ds-nmb-btn rf-ds-act " id="formBuscador:data1_ds_1">1</span><a class="rf-ds-nmb-btn " id="formBuscador:data1_ds_2">2</a><a class="rf-ds-nmb-btn " id="formBuscador:data1_ds_3">3</a></span>`;

    const info = detectPaginator(pageWithBody(html));

    expect(info).toEqual({
      paginatorId: 'formBuscador:data1',
      availablePages: [1, 2, 3],
      hasMorePages: false,
    });
  });

  it('returns null when there is no paginator markup at all in the html', () => {
    const info = detectPaginator(pageWithBody('<div id="formBuscador:panel">sin resultados</div>'));

    expect(info).toBeNull();
  });

  it('returns null when config.paginatorId is set to an id that does not exist in the html', () => {
    const info = detectPaginator(pageWithBody(REAL_PAGINATOR_HTML), {
      paginatorId: 'formBuscador:doesNotExist',
    });

    expect(info).toBeNull();
  });

  it('honors config.paginatorId over auto-detection when there are multiple candidates', () => {
    const html = `
      <span class="rf-ds " id="formBuscador:decoy"><span class="rf-ds-nmb-btn rf-ds-act " id="formBuscador:decoy_ds_1">1</span><a class="rf-ds-nmb-btn " id="formBuscador:decoy_ds_2">2</a></span>
      <span class="rf-ds " id="formBuscador:data1"><span class="rf-ds-nmb-btn rf-ds-act " id="formBuscador:data1_ds_1">1</span><a class="rf-ds-nmb-btn " id="formBuscador:data1_ds_2">2</a><a class="rf-ds-nmb-btn " id="formBuscador:data1_ds_3">3</a><a class="rf-ds-btn rf-ds-btn-next" id="formBuscador:data1_ds_next">»</a></span>
    `;

    const info = detectPaginator(pageWithBody(html), { paginatorId: 'formBuscador:data1' });

    expect(info).toEqual({
      paginatorId: 'formBuscador:data1',
      availablePages: [1, 2, 3],
      hasMorePages: true,
    });
  });
});
