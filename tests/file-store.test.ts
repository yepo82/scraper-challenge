import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  saveDiscoveryReport,
  saveInitialPageHtml,
  savePageHtml,
  saveSearchResponse,
} from '../src/storage/file-store.js';
import type { SiteDiscoveryReport } from '../src/types.js';

let testDir: string | undefined;

function makeTestDir(): string {
  testDir = path.join(os.tmpdir(), `scraper-challenge-file-store-test-${randomUUID()}`);
  return testDir;
}

afterEach(async () => {
  if (testDir) {
    await fs.rm(testDir, { recursive: true, force: true });
    testDir = undefined;
  }
});

const FIXTURE_REPORT: SiteDiscoveryReport = {
  formId: 'formBuscador',
  hiddenInputs: { 'javax.faces.ViewState': '123:456' },
  candidateSearchButtons: [{ name: 'formBuscador:j_idt31', onclick: 'mojarra.jsfcljs(...)' }],
  candidateTables: [],
  candidatePaginators: [],
  candidatePdfControls: [],
};

describe('saveInitialPageHtml', () => {
  it('writes the raw HTML to <outputDir>/debug/initial-page.html and returns that path', async () => {
    const outputDir = makeTestDir();
    const html = '<html><body>hello</body></html>';

    const filePath = await saveInitialPageHtml(outputDir, html);

    expect(filePath).toBe(path.join(outputDir, 'debug', 'initial-page.html'));
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe(html);
  });
});

describe('saveDiscoveryReport', () => {
  it('writes the report to <outputDir>/debug/discovery-report.json and returns that path', async () => {
    const outputDir = makeTestDir();

    const filePath = await saveDiscoveryReport(outputDir, FIXTURE_REPORT);

    expect(filePath).toBe(path.join(outputDir, 'debug', 'discovery-report.json'));
    const raw = await fs.readFile(filePath, 'utf-8');
    expect(JSON.parse(raw)).toEqual(FIXTURE_REPORT);
  });
});

describe('saveSearchResponse', () => {
  it('writes the raw response body to <outputDir>/debug/search-response.xml and returns that path', async () => {
    const outputDir = makeTestDir();
    // El nombre de archivo termina en .xml por requisito de aceptación aunque el sitio real
    // devuelva HTML plano (Fase 5: no es un partial-response JSF, es una redirección clásica).
    const rawResponse = '<html><body>resultado</body></html>';

    const filePath = await saveSearchResponse(outputDir, rawResponse);

    expect(filePath).toBe(path.join(outputDir, 'debug', 'search-response.xml'));
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe(rawResponse);
  });
});

describe('savePageHtml', () => {
  it('writes HTML to <outputDir>/debug/page-<n>.html and returns that path', async () => {
    const outputDir = makeTestDir();
    const html = '<html><body>page 1</body></html>';

    const filePath = await savePageHtml(outputDir, 1, html);

    expect(filePath).toBe(path.join(outputDir, 'debug', 'page-1.html'));
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe(html);
  });
});
