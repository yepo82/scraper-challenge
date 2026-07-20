import { describe, expect, it } from 'vitest';
import { generateDocumentId, generatePdfFilename } from '../src/utils/filenames.js';

describe('generateDocumentId', () => {
  it('produces the same id for the same input (stable)', () => {
    const input = {
      expediente: '00442-2016-0-0601-JR-CI-02',
      fecha: '17/07/2026',
      sala: 'SALA CIVIL - SEDE DE CORTE',
      tipoResolucion: 'Sentencia de Vista',
      rawFields: {},
    };

    expect(generateDocumentId(input)).toBe(generateDocumentId(input));
  });

  it('produces different ids for different expediente values', () => {
    const base = {
      fecha: '17/07/2026',
      sala: 'SALA CIVIL - SEDE DE CORTE',
      tipoResolucion: 'Sentencia de Vista',
      rawFields: {},
    };

    const idA = generateDocumentId({ ...base, expediente: '00442-2016-0-0601-JR-CI-02' });
    const idB = generateDocumentId({ ...base, expediente: '00999-2016-0-0601-JR-CI-02' });

    expect(idA).not.toBe(idB);
  });

  it('falls back to hashing rawFields/pdfActionId/pdfUrl when expediente is missing, and stays stable', () => {
    const input = {
      rawFields: { Especialidad: 'Civil' },
      pdfActionId: 'formBuscador:repeat:0:j_idt503',
      pdfUrl: undefined,
    };

    const idA = generateDocumentId(input);
    const idB = generateDocumentId(input);

    expect(idA).toBe(idB);
    expect(idA).toBeTruthy();
  });

  it('fallback ids differ when rawFields differ', () => {
    const idA = generateDocumentId({ rawFields: { Especialidad: 'Civil' } });
    const idB = generateDocumentId({ rawFields: { Especialidad: 'Penal' } });

    expect(idA).not.toBe(idB);
  });
});

describe('generatePdfFilename', () => {
  it('builds a sensible filename from real-looking data and ends in .pdf', () => {
    const filename = generatePdfFilename({
      id: 'abc123',
      expediente: '00442-2016-0-0601-JR-CI-02',
      tipoResolucion: 'Sentencia de Vista',
    });

    expect(filename.endsWith('.pdf')).toBe(true);
    expect(filename).toContain('00442-2016-0-0601-JR-CI-02');
  });

  it('sanitizes filesystem-unsafe characters', () => {
    const filename = generatePdfFilename({
      id: 'abc123',
      expediente: '00442/2016:0-0601-JR-CI-02',
    });

    expect(filename).not.toContain('/');
    expect(filename).not.toContain(':');
    expect(filename.endsWith('.pdf')).toBe(true);
  });

  it('truncates a base name longer than 180 characters before appending .pdf', () => {
    const longExpediente = 'X'.repeat(300);

    const filename = generatePdfFilename({ id: 'abc123', expediente: longExpediente });

    expect(filename.endsWith('.pdf')).toBe(true);
    expect(filename.length).toBe(180 + '.pdf'.length);
  });

  it('falls back to DOCUMENTO_<id>.pdf when no usable data is present', () => {
    const filename = generatePdfFilename({ id: 'abc123' });

    expect(filename).toBe('DOCUMENTO_abc123.pdf');
  });
});
