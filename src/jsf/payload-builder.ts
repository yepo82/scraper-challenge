import type { JsfPayloadOptions } from '../types.js';

// Encuentra la llamada a mojarra.jsfcljs(...) embebida dentro de un onclick más grande
// (normalmente envuelta en jsf.util.chain(...)). El sitio real delimita los strings del objeto
// de params con comillas simples escapadas con backslash (\'), pero se soporta también la
// comilla simple plana por robustez ante variaciones de markup.
const JSFCLJS_CALL_PATTERN = /mojarra\.jsfcljs\([^,]+,\s*\{([\s\S]*?)\}\s*,/;
const PARAM_ENTRY_PATTERN = /\\?'([^'\\]*)\\?'\s*:\s*\\?'([^'\\]*)\\?'/g;

export function extractOnclickParams(onclick: string): Record<string, string> {
  if (!onclick) {
    return {};
  }

  const callMatch = JSFCLJS_CALL_PATTERN.exec(onclick);
  if (!callMatch) {
    return {};
  }

  const params: Record<string, string> = {};
  const paramsLiteral = callMatch[1];
  let entryMatch: RegExpExecArray | null;
  PARAM_ENTRY_PATTERN.lastIndex = 0;
  while ((entryMatch = PARAM_ENTRY_PATTERN.exec(paramsLiteral)) !== null) {
    params[entryMatch[1]] = entryMatch[2];
  }

  return params;
}

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
