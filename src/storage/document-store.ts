import fs from 'node:fs/promises';
import path from 'node:path';
import type { DocumentRecord } from '../types.js';
import { writeJsonFile } from '../utils/files.js';
import { writeDocumentsCsv } from './csv-writer.js';

function documentsJsonPath(outputDir: string): string {
  return path.join(outputDir, 'documents.json');
}

function documentsCsvPath(outputDir: string): string {
  return path.join(outputDir, 'documents.csv');
}

export async function loadDocuments(outputDir: string): Promise<DocumentRecord[]> {
  try {
    const raw = await fs.readFile(documentsJsonPath(outputDir), 'utf-8');
    return JSON.parse(raw) as DocumentRecord[];
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function saveDocuments(
  outputDir: string,
  documents: DocumentRecord[],
): Promise<{ jsonPath: string; csvPath: string }> {
  const existing = await loadDocuments(outputDir);

  // Los datos nuevos ganan ante conflicto de id (ej.: un re-scrape puede traer un pdfStatus
  // actualizado); esto evita duplicados por id sin perder frescura de datos.
  const merged = new Map<string, DocumentRecord>(existing.map((document) => [document.id, document]));
  for (const document of documents) {
    merged.set(document.id, document);
  }
  const mergedDocuments = Array.from(merged.values());

  const jsonPath = documentsJsonPath(outputDir);
  const csvPath = documentsCsvPath(outputDir);

  await writeJsonFile(jsonPath, mergedDocuments);
  await writeDocumentsCsv(csvPath, mergedDocuments);

  return { jsonPath, csvPath };
}
