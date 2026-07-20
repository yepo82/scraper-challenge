import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { DocumentRecord } from '../types.js';
import { generateDocumentId, generatePdfFilename } from '../utils/filenames.js';

const PANEL_ID_SUBSTRING = ':repeat:';
const PDF_HREF_KEYWORD = 'servletdescarga';
const PDF_ACTION_KEYWORDS = ['descarga', 'resolucion'];

type NormalizedFieldKey = 'materia' | 'tipoResolucion' | 'fecha' | 'sala' | 'sumilla';

const LABEL_TO_FIELD: Record<string, NormalizedFieldKey> = {
  Especialidad: 'materia',
  'Tipo Resolución': 'tipoResolucion',
  'Fecha Resolución': 'fecha',
  'Órgano Jurisdiccional': 'sala',
  Sumilla: 'sumilla',
};

interface ExtractedFields {
  recurso?: string;
  expediente?: string;
  rawFields: Record<string, string>;
  materia?: string;
  tipoResolucion?: string;
  fecha?: string;
  sala?: string;
  sumilla?: string;
}

function extractHeaderFields($: cheerio.CheerioAPI, panel: cheerio.Cheerio<AnyNode>): {
  recurso?: string;
  expediente?: string;
} {
  const spans = panel.find('span[style*="font-weight:bold"]');
  const recurso = spans.eq(0).text().trim() || undefined;
  const expediente = spans.eq(1).text().trim() || undefined;
  return { recurso, expediente };
}

function extractBodyFields($: cheerio.CheerioAPI, panel: cheerio.Cheerio<AnyNode>): ExtractedFields {
  const result: ExtractedFields = { rawFields: {} };

  panel.find('div.txtbold').each((_, element) => {
    const labelEl = $(element);
    const rawLabel = labelEl.text().trim();
    if (!rawLabel) return;
    const label = rawLabel.endsWith(':') ? rawLabel.slice(0, -1) : rawLabel;

    const valueEl = labelEl.next();
    const value = valueEl.text().trim();

    result.rawFields[label] = value;

    const normalizedField = LABEL_TO_FIELD[label];
    if (normalizedField) {
      result[normalizedField] = value;
    }
  });

  return result;
}

function detectPdfPointer(
  $: cheerio.CheerioAPI,
  panel: cheerio.Cheerio<AnyNode>,
): { pdfUrl?: string; pdfActionId?: string } {
  let pdfUrl: string | undefined;
  panel.find('a[href]').each((_, element) => {
    if (pdfUrl) return;
    const href = $(element).attr('href');
    if (href && href.toLowerCase().includes(PDF_HREF_KEYWORD)) {
      pdfUrl = href;
    }
  });

  if (pdfUrl) return { pdfUrl };

  // Sin href de ServletDescarga: fallback laxo, solo capturamos el id como puntero para que
  // una fase posterior decida cómo disparar la descarga (no se intenta parsear el onclick).
  let pdfActionId: string | undefined;
  panel.find('*').each((_, element) => {
    if (pdfActionId) return;
    const el = $(element);
    const id = el.attr('id');
    const onclick = el.attr('onclick');
    const haystack = `${id ?? ''} ${onclick ?? ''}`.toLowerCase();
    if (PDF_ACTION_KEYWORDS.some((keyword) => haystack.includes(keyword)) && id) {
      pdfActionId = id;
    }
  });

  return { pdfActionId };
}

/**
 * Extrae los documentos de una página de resultados real: NO es una <table> clásica sino una
 * secuencia de paneles RichFaces (div.rf-p con id "...:repeat:N:<sufijo autogenerado
 * inestable>"). Best-effort por diseño: un panel sin algún campo no debe descartar el resto.
 */
export function parseDocumentsFromResultsHtml(
  html: string,
  context: { pageNumber: number },
): DocumentRecord[] {
  const $ = cheerio.load(html);
  const panels = $(`div.rf-p[id*="${PANEL_ID_SUBSTRING}"]`);

  const documents: DocumentRecord[] = [];

  panels.each((index, element) => {
    const panel = $(element);
    const { recurso, expediente } = extractHeaderFields($, panel);
    const bodyFields = extractBodyFields($, panel);

    if (recurso) {
      bodyFields.rawFields.recurso = recurso;
    }

    const title = recurso && expediente ? `${recurso} — ${expediente}` : undefined;

    const { pdfUrl, pdfActionId } = detectPdfPointer($, panel);

    const id = generateDocumentId({
      expediente,
      fecha: bodyFields.fecha,
      sala: bodyFields.sala,
      tipoResolucion: bodyFields.tipoResolucion,
      rawFields: bodyFields.rawFields,
      pdfActionId,
      pdfUrl,
    });

    const pdfFilename = generatePdfFilename({
      id,
      expediente,
      tipoResolucion: bodyFields.tipoResolucion,
      sala: bodyFields.sala,
      title,
    });

    const record: DocumentRecord = {
      id,
      pageNumber: context.pageNumber,
      rowNumber: index + 1,
      title,
      expediente,
      sala: bodyFields.sala,
      materia: bodyFields.materia,
      fecha: bodyFields.fecha,
      tipoResolucion: bodyFields.tipoResolucion,
      sumilla: bodyFields.sumilla,
      rawFields: bodyFields.rawFields,
      pdfUrl,
      pdfActionId,
      pdfFilename,
      pdfStatus: 'pending',
      scrapedAt: new Date().toISOString(),
    };

    documents.push(record);
  });

  return documents;
}
