import { stringify } from 'csv-stringify/sync';
import type { DocumentRecord } from '../types.js';
import { writeTextFile } from '../utils/files.js';

const CSV_COLUMNS = [
  'id',
  'pageNumber',
  'rowNumber',
  'title',
  'expediente',
  'sala',
  'materia',
  'fecha',
  'tipoResolucion',
  'sumilla',
  'pdfUrl',
  'pdfActionId',
  'pdfFilename',
  'pdfStatus',
  'scrapedAt',
  'rawFields',
] as const;

export async function writeDocumentsCsv(filePath: string, documents: DocumentRecord[]): Promise<void> {
  const rows = documents.map((document) => ({
    id: document.id,
    pageNumber: document.pageNumber,
    rowNumber: document.rowNumber,
    title: document.title ?? '',
    expediente: document.expediente ?? '',
    sala: document.sala ?? '',
    materia: document.materia ?? '',
    fecha: document.fecha ?? '',
    tipoResolucion: document.tipoResolucion ?? '',
    sumilla: document.sumilla ?? '',
    pdfUrl: document.pdfUrl ?? '',
    pdfActionId: document.pdfActionId ?? '',
    pdfFilename: document.pdfFilename,
    pdfStatus: document.pdfStatus,
    scrapedAt: document.scrapedAt,
    // rawFields es un objeto anidado heterogéneo entre documentos (distintas etiquetas según
    // el panel); no se puede aplanar en columnas dinámicas de forma consistente en un CSV, así
    // que se serializa como una única columna JSON en vez de una columna por etiqueta.
    rawFields: JSON.stringify(document.rawFields),
  }));

  const csv = stringify(rows, { header: true, columns: [...CSV_COLUMNS] });
  await writeTextFile(filePath, csv);
}
