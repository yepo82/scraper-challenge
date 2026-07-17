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
