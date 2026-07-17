import { describe, expect, it } from 'vitest';
import { isPartialResponseBody, parsePartialResponse } from '../src/jsf/partial-response.js';

describe('parsePartialResponse', () => {
  it('extracts multiple updates in order and the ViewState convenience field', () => {
    const cdataContent =
      '<div id="formBuscador:resultPanel" class="panel" data-x="a & b"><span title="quoted value">3 resultados</span></div>';
    const xml = `<?xml version='1.0' encoding='UTF-8'?>
<partial-response><changes><update id="formBuscador:resultPanel"><![CDATA[${cdataContent}]]></update><update id="javax.faces.ViewState"><![CDATA[4125160013028538766:4987307647222301957]]></update></changes></partial-response>`;

    const result = parsePartialResponse(xml);

    expect(result.updates).toHaveLength(2);
    expect(result.updates[0]).toEqual({
      id: 'formBuscador:resultPanel',
      content: cdataContent,
    });
    expect(result.updates[1]).toEqual({
      id: 'javax.faces.ViewState',
      content: '4125160013028538766:4987307647222301957',
    });
    expect(result.viewState).toBe('4125160013028538766:4987307647222301957');
  });

  it('still returns an array of length 1 when there is exactly one update element', () => {
    const xml = `<?xml version='1.0' encoding='UTF-8'?>
<partial-response><changes><update id="formBuscador:resultPanel"><![CDATA[<span>ok</span>]]></update></changes></partial-response>`;

    const result = parsePartialResponse(xml);

    expect(Array.isArray(result.updates)).toBe(true);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0]).toEqual({ id: 'formBuscador:resultPanel', content: '<span>ok</span>' });
  });

  it('returns viewState undefined when no ViewState update is present', () => {
    const xml = `<?xml version='1.0' encoding='UTF-8'?>
<partial-response><changes><update id="formBuscador:resultPanel"><![CDATA[<span>ok</span>]]></update></changes></partial-response>`;

    const result = parsePartialResponse(xml);

    expect(result.viewState).toBeUndefined();
    expect(result.updates).toHaveLength(1);
  });

  it('returns an empty updates array for malformed or empty input without throwing', () => {
    expect(parsePartialResponse('')).toEqual({ updates: [] });
    expect(parsePartialResponse('not xml at all')).toEqual({ updates: [] });
    expect(parsePartialResponse('<partial-response><changes></changes></partial-response>')).toEqual({
      updates: [],
    });
  });
});

describe('isPartialResponseBody', () => {
  // Hallazgo empírico contra el sitio real (Fase 5): las páginas reales son XHTML y arrancan
  // legítimamente con el prólogo `<?xml version="1.0" encoding="UTF-8"?>` seguido de un
  // <!DOCTYPE html ...> y <html>. Un chequeo que solo mira el prefijo "<?xml" confunde esto con
  // un partial-response real de JSF/RichFaces y rompe la extracción de ViewState contra el
  // sitio real. La señal correcta es la presencia de la etiqueta raíz <partial-response>.
  it('returns true for a genuine partial-response XML with the xml prolog', () => {
    const xml = `<?xml version='1.0' encoding='UTF-8'?>
<partial-response><changes><update id="javax.faces.ViewState"><![CDATA[vs-1]]></update></changes></partial-response>`;

    expect(isPartialResponseBody(xml)).toBe(true);
  });

  it('returns true for a genuine partial-response XML without the xml prolog', () => {
    expect(isPartialResponseBody('<partial-response><changes></changes></partial-response>')).toBe(true);
  });

  it('returns false for a real XHTML document that starts with the xml prolog (site fixture)', () => {
    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>test</title></head>
<body><form id="formBuscador"><input type="hidden" name="javax.faces.ViewState" value="vs-1" /></form></body></html>`;

    expect(isPartialResponseBody(xhtml)).toBe(false);
  });

  it('returns false for a plain HTML document without an xml prolog', () => {
    expect(isPartialResponseBody('<!DOCTYPE html><html><body>hi</body></html>')).toBe(false);
  });

  it('returns false for empty or unrelated input', () => {
    expect(isPartialResponseBody('')).toBe(false);
    expect(isPartialResponseBody('not xml at all')).toBe(false);
  });
});
