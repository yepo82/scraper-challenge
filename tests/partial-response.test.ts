import { describe, expect, it } from 'vitest';
import { parsePartialResponse } from '../src/jsf/partial-response.js';

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
