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

// Hallazgo empírico contra el sitio real (Fase 5): las páginas reales son XHTML y arrancan
// legítimamente con el prólogo `<?xml version="1.0" encoding="UTF-8"?>` seguido de
// <!DOCTYPE html ...> y <html>. Chequear solo el prefijo "<?xml" (como hacía la Fase 3) confunde
// una página XHTML normal con un partial-response real de JSF/RichFaces y rompe la extracción de
// ViewState contra el sitio real. La señal correcta es la presencia de la etiqueta raíz
// <partial-response>, con o sin el prólogo XML antes.
export function isPartialResponseBody(body: string): boolean {
  if (!body || typeof body !== 'string') {
    return false;
  }
  const trimmed = body.trim();
  return /^(<\?xml[^>]*\?>\s*)?<partial-response[\s>]/i.test(trimmed);
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
