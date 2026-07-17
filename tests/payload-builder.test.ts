import { describe, expect, it } from 'vitest';
import { buildJsfPayload } from '../src/jsf/payload-builder.js';

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
