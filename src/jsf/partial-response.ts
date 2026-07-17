import { XMLParser } from 'fast-xml-parser';
import type { JsfPartialUpdate } from '../types.js';

// Sin `isArray`, un único <update> colapsa a un objeto plano en vez de un array
// de un elemento: gotcha conocido de fast-xml-parser que rompe a los callers
// que siempre esperan iterar `updates` como lista.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => name === 'update',
});

interface ParsedUpdate {
  '@_id'?: unknown;
  '#text'?: unknown;
}

interface ParsedPartialResponse {
  'partial-response'?: {
    changes?: {
      update?: ParsedUpdate[];
    };
  };
}

export function parsePartialResponse(xml: string): { updates: JsfPartialUpdate[]; viewState?: string } {
  if (!xml || typeof xml !== 'string') {
    return { updates: [] };
  }

  let parsed: ParsedPartialResponse;
  try {
    parsed = parser.parse(xml) as ParsedPartialResponse;
  } catch {
    return { updates: [] };
  }

  const rawUpdates = parsed['partial-response']?.changes?.update;
  if (!Array.isArray(rawUpdates) || rawUpdates.length === 0) {
    return { updates: [] };
  }

  const updates: JsfPartialUpdate[] = rawUpdates
    .filter((update) => typeof update?.['@_id'] === 'string')
    .map((update) => ({
      id: update['@_id'] as string,
      content: typeof update['#text'] === 'string' ? update['#text'] : '',
    }));

  if (updates.length === 0) {
    return { updates: [] };
  }

  const viewStateUpdate = updates.find((update) => update.id === 'javax.faces.ViewState');

  return viewStateUpdate ? { updates, viewState: viewStateUpdate.content } : { updates };
}
