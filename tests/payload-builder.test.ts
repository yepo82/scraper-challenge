import { describe, expect, it } from 'vitest';
import { buildJsfPayload, extractOnclickParams } from '../src/jsf/payload-builder.js';

describe('buildJsfPayload', () => {
  it('builds the base payload with the self-referencing form field and ViewState', () => {
    const payload = buildJsfPayload({
      formId: 'formBuscador',
      viewState: '4125160013028538766:4987307647222301956',
    });

    expect(payload).toEqual({
      formBuscador: 'formBuscador',
      'javax.faces.ViewState': '4125160013028538766:4987307647222301956',
    });
  });

  it('merges extra params on top of the base payload', () => {
    const payload = buildJsfPayload({
      formId: 'formBuscador',
      viewState: 'vs-1',
      params: { 'formBuscador:criterio': 'texto libre' },
    });

    expect(payload).toEqual({
      formBuscador: 'formBuscador',
      'javax.faces.ViewState': 'vs-1',
      'formBuscador:criterio': 'texto libre',
    });
  });

  it('adds ajax fields with execute defaulting to source when execute is not given', () => {
    const payload = buildJsfPayload({
      formId: 'formBuscador',
      viewState: 'vs-1',
      ajax: { source: 'formBuscador:btnBuscar' },
    });

    expect(payload).toEqual({
      formBuscador: 'formBuscador',
      'javax.faces.ViewState': 'vs-1',
      'javax.faces.partial.ajax': 'true',
      'javax.faces.source': 'formBuscador:btnBuscar',
      'javax.faces.partial.execute': 'formBuscador:btnBuscar',
    });
    expect(payload).not.toHaveProperty('javax.faces.partial.render');
  });

  it('uses the explicit execute value and includes render when both are given', () => {
    const payload = buildJsfPayload({
      formId: 'formBuscador',
      viewState: 'vs-1',
      ajax: {
        source: 'formBuscador:btnBuscar',
        execute: 'formBuscador',
        render: 'formBuscador:resultPanel',
      },
    });

    expect(payload).toEqual({
      formBuscador: 'formBuscador',
      'javax.faces.ViewState': 'vs-1',
      'javax.faces.partial.ajax': 'true',
      'javax.faces.source': 'formBuscador:btnBuscar',
      'javax.faces.partial.execute': 'formBuscador',
      'javax.faces.partial.render': 'formBuscador:resultPanel',
    });
  });
});

describe('extractOnclickParams', () => {
  // Bytes reales tomados del botón de búsqueda del sitio (ver Fase 5): jsf.util.chain(...) envuelve
  // una llamada a mojarra.jsfcljs(...) cuyo objeto de params usa comillas simples escapadas con
  // backslash (\') como delimitador, no comillas simples planas.
  const REAL_ONCLICK =
    String.raw`jsf.util.chain(this,event,'this.form.target=\'_self\';RichFaces.$(\'panelState\').show();','mojarra.jsfcljs(document.getElementById(\'formBuscador\'),{\'formBuscador:j_idt31\':\'formBuscador:j_idt31\',\'forward\':\'buscar\',\'busqueda\':\'especializada\',\'formBuscador:j_idt34\':\'21\',\'formBuscador:j_idt35\':\'DESC\',\'formBuscador:j_idt36\':\'Principal\',\'formBuscador:j_idt37\':\'1\'},\'\')');return false`;

  it('extracts all params from the real backslash-escaped-quote onclick fixture', () => {
    const params = extractOnclickParams(REAL_ONCLICK);

    expect(params).toEqual({
      'formBuscador:j_idt31': 'formBuscador:j_idt31',
      forward: 'buscar',
      busqueda: 'especializada',
      'formBuscador:j_idt34': '21',
      'formBuscador:j_idt35': 'DESC',
      'formBuscador:j_idt36': 'Principal',
      'formBuscador:j_idt37': '1',
    });
    expect(Object.keys(params)).toHaveLength(7);
  });

  it('extracts params from a mojarra.jsfcljs call with plain (non-escaped) quotes', () => {
    const onclick = `mojarra.jsfcljs(document.getElementById('x'),{'a':'b'},'')`;

    expect(extractOnclickParams(onclick)).toEqual({ a: 'b' });
  });

  it('returns {} without throwing when there is no mojarra.jsfcljs call', () => {
    expect(extractOnclickParams("RichFaces.$('panelState').show();")).toEqual({});
  });

  it('returns {} for empty string input', () => {
    expect(extractOnclickParams('')).toEqual({});
  });
});
