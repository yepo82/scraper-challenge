import { describe, expect, it } from 'vitest';
import { parseDocumentsFromResultsHtml } from '../src/scraper/parser.js';

// Fixture basado en la estructura real verificada contra el sitio (jurisprudencia.pj.gob.pe,
// búsqueda "civil"): NO es una <table> clásica, es una secuencia de paneles RichFaces
// (div.rf-p) con id "formBuscador:repeat:N:<idAutogenerado>". El sufijo autogenerado
// (j_idt455 en el sitio real) es inestable entre cargas de página, por eso el fixture usa
// otro sufijo distinto (panelXYZ) para probar que el parser no depende de "j_idt455" literal.
function buildPanel(options: {
  index: number;
  recurso?: string;
  expediente?: string;
  fields?: Record<string, string>;
  pdfHref?: string;
  fallbackActionId?: string;
}): string {
  const { index, recurso, expediente, fields = {}, pdfHref, fallbackActionId } = options;

  const headerSpans = [
    recurso !== undefined ? `<span style="font-weight:bold">  ${recurso}   </span>` : '',
    expediente !== undefined ? `<span style="font-weight:bold">${expediente}</span>` : '',
  ].join('');

  const rows: string[] = [];
  for (const [label, value] of Object.entries(fields)) {
    rows.push(
      `<div class="row"><div class="col-sm-4 marginb"><div class="col-md-12 txtbold">${label}:</div><div class="col-md-12">${value}</div></div></div>`,
    );
  }

  const pdfLink = pdfHref
    ? `<a href="${pdfHref}"><img src="/jurisprudenciaweb/imagen/btn-ver-resolucion.png" class="social" /></a>`
    : fallbackActionId
      ? `<a href="#" id="${fallbackActionId}" onclick="return false;">descarga</a>`
      : '';

  return `
  <div class="rf-p " id="formBuscador:repeat:${index}:panelXYZ" style="width:100%; text-align:left;">
    <div class="rf-p-hdr " id="formBuscador:repeat:${index}:panelXYZ_header">
      <table style="text-align:left;">
        <tbody><tr>
          <td><input type="checkbox" /></td>
          <td>${headerSpans}</td>
        </tr></tbody>
      </table>
    </div>
    <div class="rf-p-b " id="formBuscador:repeat:${index}:panelXYZ_body">
      <br />
      ${rows.join('\n')}
      <table><tr>
        <td><a href="#" id="formBuscador:repeat:${index}:verLink" onclick="return false;" title="Ver"><img src="../imagen/btn-ver-ficha.png" /></a></td>
        <td> </td>
        <td>${pdfLink}</td>
      </tr></table>
    </div>
  </div>`;
}

function pageWithPanels(panelsHtml: string): string {
  return `<html><body><div id="formBuscador:repeat">${panelsHtml}</div></body></html>`;
}

const FULL_FIELDS = {
  'Especialidad': 'Civil',
  'Tipo Resolución': 'Sentencia de Vista',
  'Fecha Resolución': '17/07/2026',
  'Órgano Jurisdiccional': 'SALA CIVIL - SEDE DE CORTE',
  'Pretención / Delito': 'NULIDAD DE ACTO JURIDICO',
  'Sumilla': '1.CONFIRMAR LA SENTENCIA...COMPETENCIA.',
  'Palabras Clave': 'SENTENCIA FUNDADA REIVINDICACIÓN',
};

describe('parseDocumentsFromResultsHtml', () => {
  it('extracts a full realistic panel into a DocumentRecord with all normalized fields', () => {
    const html = pageWithPanels(
      buildPanel({
        index: 0,
        recurso: 'Apelación',
        expediente: '00442-2016-0-0601-JR-CI-02',
        fields: FULL_FIELDS,
        pdfHref: '/jurisprudenciaweb/ServletDescarga?uuid=7a3377b0-21a7-4954-87f4-3d37d37d0945',
      }),
    );

    const [record] = parseDocumentsFromResultsHtml(html, { pageNumber: 1 });

    expect(record).toBeDefined();
    expect(record.expediente).toBe('00442-2016-0-0601-JR-CI-02');
    expect(record.materia).toBe('Civil');
    expect(record.tipoResolucion).toBe('Sentencia de Vista');
    expect(record.fecha).toBe('17/07/2026');
    expect(record.sala).toBe('SALA CIVIL - SEDE DE CORTE');
    expect(record.sumilla).toBe('1.CONFIRMAR LA SENTENCIA...COMPETENCIA.');
    expect(record.title).toBe('Apelación — 00442-2016-0-0601-JR-CI-02');

    expect(record.rawFields.recurso).toBe('Apelación');
    expect(record.rawFields['Especialidad']).toBe('Civil');
    expect(record.rawFields['Tipo Resolución']).toBe('Sentencia de Vista');
    expect(record.rawFields['Fecha Resolución']).toBe('17/07/2026');
    expect(record.rawFields['Órgano Jurisdiccional']).toBe('SALA CIVIL - SEDE DE CORTE');
    expect(record.rawFields['Pretención / Delito']).toBe('NULIDAD DE ACTO JURIDICO');
    expect(record.rawFields['Sumilla']).toBe('1.CONFIRMAR LA SENTENCIA...COMPETENCIA.');
    expect(record.rawFields['Palabras Clave']).toBe('SENTENCIA FUNDADA REIVINDICACIÓN');

    expect(record.pdfUrl).toBe('/jurisprudenciaweb/ServletDescarga?uuid=7a3377b0-21a7-4954-87f4-3d37d37d0945');
    expect(record.pdfActionId).toBeUndefined();
    expect(record.pdfFilename.endsWith('.pdf')).toBe(true);
    expect(record.id).toBeTruthy();
    expect(record.pdfStatus).toBe('pending');
    expect(record.rowNumber).toBe(1);
    expect(record.pageNumber).toBe(1);

    const [recordAgain] = parseDocumentsFromResultsHtml(html, { pageNumber: 1 });
    expect(recordAgain.id).toBe(record.id);
  });

  it('returns 2 records with rowNumber 1 and 2 and distinct ids for two panels', () => {
    const html = pageWithPanels(
      buildPanel({ index: 0, recurso: 'Apelación', expediente: 'EXP-001', fields: FULL_FIELDS }) +
        buildPanel({ index: 1, recurso: 'Consulta', expediente: 'EXP-002', fields: FULL_FIELDS }),
    );

    const records = parseDocumentsFromResultsHtml(html, { pageNumber: 1 });

    expect(records).toHaveLength(2);
    expect(records[0]?.rowNumber).toBe(1);
    expect(records[1]?.rowNumber).toBe(2);
    expect(records[0]?.id).not.toBe(records[1]?.id);
    expect(records[0]?.expediente).toBe('EXP-001');
    expect(records[1]?.expediente).toBe('EXP-002');
  });

  it('leaves the normalized field undefined and does not throw when a label is missing', () => {
    const { Sumilla: _omit, ...fieldsWithoutSumilla } = FULL_FIELDS;
    const html = pageWithPanels(
      buildPanel({ index: 0, recurso: 'Apelación', expediente: 'EXP-003', fields: fieldsWithoutSumilla }),
    );

    expect(() => parseDocumentsFromResultsHtml(html, { pageNumber: 1 })).not.toThrow();

    const [record] = parseDocumentsFromResultsHtml(html, { pageNumber: 1 });
    expect(record.sumilla).toBeUndefined();
    expect(record.rawFields['Sumilla']).toBeUndefined();
    expect(record.materia).toBe('Civil');
    expect(record.expediente).toBe('EXP-003');
  });

  it('sets pdfActionId when no ServletDescarga href exists but an id contains "descarga"', () => {
    const html = pageWithPanels(
      buildPanel({
        index: 0,
        recurso: 'Apelación',
        expediente: 'EXP-004',
        fields: FULL_FIELDS,
        fallbackActionId: 'formBuscador:repeat:0:btnDescarga',
      }),
    );

    const [record] = parseDocumentsFromResultsHtml(html, { pageNumber: 1 });

    expect(record.pdfActionId).toBe('formBuscador:repeat:0:btnDescarga');
    expect(record.pdfUrl).toBeUndefined();
  });

  it('leaves both pdfUrl and pdfActionId undefined and does not throw when no PDF pointer exists', () => {
    const html = pageWithPanels(
      buildPanel({ index: 0, recurso: 'Apelación', expediente: 'EXP-005', fields: FULL_FIELDS }),
    );

    expect(() => parseDocumentsFromResultsHtml(html, { pageNumber: 1 })).not.toThrow();

    const [record] = parseDocumentsFromResultsHtml(html, { pageNumber: 1 });
    expect(record.pdfUrl).toBeUndefined();
    expect(record.pdfActionId).toBeUndefined();
  });

  it('returns [] without throwing for HTML with no matching panels', () => {
    const html = '<html><body></body></html>';

    expect(() => parseDocumentsFromResultsHtml(html, { pageNumber: 1 })).not.toThrow();
    expect(parseDocumentsFromResultsHtml(html, { pageNumber: 1 })).toEqual([]);
  });

  it('produces different ids for two different real-looking fixtures with different expediente values', () => {
    const htmlA = pageWithPanels(
      buildPanel({ index: 0, recurso: 'Apelación', expediente: 'EXP-AAA', fields: FULL_FIELDS }),
    );
    const htmlB = pageWithPanels(
      buildPanel({ index: 0, recurso: 'Apelación', expediente: 'EXP-BBB', fields: FULL_FIELDS }),
    );

    const [recordA] = parseDocumentsFromResultsHtml(htmlA, { pageNumber: 1 });
    const [recordB] = parseDocumentsFromResultsHtml(htmlB, { pageNumber: 1 });

    expect(recordA.id).not.toBe(recordB.id);
  });
});
