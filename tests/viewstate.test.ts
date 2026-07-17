import { describe, expect, it } from 'vitest';
import {
  extractViewStateFromHtml,
  extractViewStateFromPartialResponse,
} from '../src/jsf/viewstate.js';

const REAL_FORM_HTML = `<form id="formBuscador" name="formBuscador" method="post" action="/jurisprudenciaweb/faces/page/inicio.xhtml;jsessionid=cTFT5UCH5-FkkrokJUklf-Eo.jvmr-scjurisp3" enctype="application/x-www-form-urlencoded">
<input type="hidden" name="formBuscador" value="formBuscador" />
<input type="hidden" name="javax.faces.ViewState" id="javax.faces.ViewState" value="4125160013028538766:4987307647222301956" autocomplete="off" />
<input id="formBuscador:tabpanel-value" name="formBuscador:tabpanel-value" type="hidden" value="general" />
</form>`;

describe('extractViewStateFromHtml', () => {
  it('extracts the ViewState value from the real form fragment', () => {
    const html = `<!DOCTYPE html><html><body>${REAL_FORM_HTML}</body></html>`;

    expect(extractViewStateFromHtml(html)).toBe('4125160013028538766:4987307647222301956');
  });

  it('extracts correctly when attributes are in a different order (value before name)', () => {
    const html = `<!DOCTYPE html><html><body>
<form id="formBuscador" name="formBuscador">
<input type="hidden" value="4125160013028538766:4987307647222301956" id="javax.faces.ViewState" name="javax.faces.ViewState" autocomplete="off" />
</form>
</body></html>`;

    expect(extractViewStateFromHtml(html)).toBe('4125160013028538766:4987307647222301956');
  });

  it('returns null when there is no ViewState field', () => {
    const html = `<!DOCTYPE html><html><body><form id="formBuscador"><input type="text" name="q" /></form></body></html>`;

    expect(extractViewStateFromHtml(html)).toBeNull();
  });
});

describe('extractViewStateFromPartialResponse', () => {
  it('extracts the ViewState value from a partial-response XML', () => {
    const xml = `<?xml version='1.0' encoding='UTF-8'?>
<partial-response><changes><update id="javax.faces.ViewState"><![CDATA[4125160013028538766:4987307647222301957]]></update></changes></partial-response>`;

    expect(extractViewStateFromPartialResponse(xml)).toBe('4125160013028538766:4987307647222301957');
  });

  it('returns null when the partial-response XML has no ViewState update', () => {
    const xml = `<?xml version='1.0' encoding='UTF-8'?>
<partial-response><changes><update id="formBuscador:resultPanel"><![CDATA[<span>ok</span>]]></update></changes></partial-response>`;

    expect(extractViewStateFromPartialResponse(xml)).toBeNull();
  });
});
