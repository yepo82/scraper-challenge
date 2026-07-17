import type { JsfPayloadOptions } from '../types.js';

export function buildJsfPayload(options: JsfPayloadOptions): Record<string, string> {
  const payload: Record<string, string> = {
    [options.formId]: options.formId,
    'javax.faces.ViewState': options.viewState,
    ...options.params,
  };

  if (options.ajax) {
    payload['javax.faces.partial.ajax'] = 'true';
    payload['javax.faces.source'] = options.ajax.source;
    payload['javax.faces.partial.execute'] = options.ajax.execute ?? options.ajax.source;
    if (options.ajax.render) {
      payload['javax.faces.partial.render'] = options.ajax.render;
    }
  }

  return payload;
}
