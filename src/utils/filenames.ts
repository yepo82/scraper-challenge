import sanitizeFilename from 'sanitize-filename';
import { sha256Hex } from './hash.js';

const MAX_BASE_NAME_LENGTH = 180;

export function generateDocumentId(input: {
  expediente?: string;
  fecha?: string;
  sala?: string;
  tipoResolucion?: string;
  rawFields: Record<string, string>;
  pdfActionId?: string;
  pdfUrl?: string;
}): string {
  if (input.expediente) {
    const composite = [input.expediente, input.fecha, input.sala, input.tipoResolucion]
      .filter(Boolean)
      .join('|');
    return sha256Hex(composite);
  }

  // Sin expediente (el identificador de caso más cercano a un id real del sitio) no hay dato
  // suficiente para armar un identificador legible; se cae a un hash de lo que sí esté
  // disponible para mantener el id determinístico ante el mismo input.
  const fallback = JSON.stringify(input.rawFields) + (input.pdfActionId ?? '') + (input.pdfUrl ?? '');
  return sha256Hex(fallback);
}

export function generatePdfFilename(input: {
  id: string;
  expediente?: string;
  tipoResolucion?: string;
  sala?: string;
  title?: string;
}): string {
  const parts = [input.expediente, input.tipoResolucion, input.sala, input.title].filter(
    (value): value is string => Boolean(value && value.trim()),
  );

  const rawBaseName = parts.length > 0 ? parts.join('_') : `DOCUMENTO_${input.id}`;
  const sanitized = sanitizeFilename(rawBaseName);
  const baseName = sanitized.length > 0 ? sanitized : `DOCUMENTO_${input.id}`;

  return `${baseName.slice(0, MAX_BASE_NAME_LENGTH)}.pdf`;
}
