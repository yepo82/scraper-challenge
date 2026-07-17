import path from 'node:path';
import type { SiteDiscoveryReport } from '../types.js';
import { writeJsonFile, writeTextFile } from '../utils/files.js';

export async function saveInitialPageHtml(outputDir: string, html: string): Promise<string> {
  const filePath = path.join(outputDir, 'debug', 'initial-page.html');
  await writeTextFile(filePath, html);
  return filePath;
}

export async function saveDiscoveryReport(
  outputDir: string,
  report: SiteDiscoveryReport,
): Promise<string> {
  const filePath = path.join(outputDir, 'debug', 'discovery-report.json');
  await writeJsonFile(filePath, report);
  return filePath;
}

// El nombre termina en .xml por requisito de aceptación de la Fase 5, aunque el flujo real de
// búsqueda es un POST/redirect síncrono clásico y el body que se guarda acá es HTML, no XML.
export async function saveSearchResponse(outputDir: string, rawResponse: string): Promise<string> {
  const filePath = path.join(outputDir, 'debug', 'search-response.xml');
  await writeTextFile(filePath, rawResponse);
  return filePath;
}

export async function savePageHtml(outputDir: string, pageNumber: number, html: string): Promise<string> {
  const filePath = path.join(outputDir, 'debug', `page-${pageNumber}.html`);
  await writeTextFile(filePath, html);
  return filePath;
}
