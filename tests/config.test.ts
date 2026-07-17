import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = [
  'BASE_URL',
  'OUTPUT_DIR',
  'MAX_PAGES',
  'MAX_DOCUMENTS',
  'DOWNLOAD_PDFS',
  'REQUEST_TIMEOUT_MS',
  'BASE_DELAY_MS',
  'MAX_RETRIES',
  'MAX_BACKOFF_MS',
  'PDF_CONCURRENCY',
  'LOG_LEVEL',
  'SEARCH_BUTTON_ID',
] as const;

const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

async function importAppConfig() {
  const mod = await import('../src/config.js');
  return mod.appConfig;
}

describe('appConfig', () => {
  it('parses a fully specified valid environment with correct types', async () => {
    process.env.BASE_URL = 'https://example.test/page';
    process.env.OUTPUT_DIR = './custom-output';
    process.env.MAX_PAGES = '10';
    process.env.MAX_DOCUMENTS = '100';
    process.env.DOWNLOAD_PDFS = 'false';
    process.env.REQUEST_TIMEOUT_MS = '15000';
    process.env.BASE_DELAY_MS = '2000';
    process.env.MAX_RETRIES = '7';
    process.env.MAX_BACKOFF_MS = '30000';
    process.env.PDF_CONCURRENCY = '4';
    process.env.LOG_LEVEL = 'debug';

    vi.resetModules();
    const appConfig = await importAppConfig();

    expect(appConfig.baseUrl).toBe('https://example.test/page');
    expect(appConfig.outputDir).toBe('./custom-output');
    expect(appConfig.maxPages).toBe(10);
    expect(typeof appConfig.maxPages).toBe('number');
    expect(appConfig.maxDocuments).toBe(100);
    expect(appConfig.downloadPdfs).toBe(false);
    expect(typeof appConfig.downloadPdfs).toBe('boolean');
    expect(appConfig.requestTimeoutMs).toBe(15000);
    expect(appConfig.baseDelayMs).toBe(2000);
    expect(appConfig.maxRetries).toBe(7);
    expect(appConfig.maxBackoffMs).toBe(30000);
    expect(appConfig.pdfConcurrency).toBe(4);
    expect(appConfig.logLevel).toBe('debug');
  });

  it('passes SEARCH_BUTTON_ID through when set', async () => {
    process.env.SEARCH_BUTTON_ID = 'formBuscador:j_idt31';

    vi.resetModules();
    const appConfig = await importAppConfig();

    expect(appConfig.searchButtonId).toBe('formBuscador:j_idt31');
  });

  it('leaves searchButtonId undefined when SEARCH_BUTTON_ID is not set', async () => {
    vi.resetModules();
    const appConfig = await importAppConfig();

    expect(appConfig.searchButtonId).toBeUndefined();
  });

  it('applies sane defaults when optional vars are not set', async () => {
    vi.resetModules();
    const appConfig = await importAppConfig();

    expect(appConfig.baseUrl).toBe(
      'https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/inicio.xhtml',
    );
    expect(appConfig.outputDir).toBe('output');
    expect(appConfig.maxPages).toBe(3);
    expect(appConfig.maxDocuments).toBe(30);
    expect(appConfig.downloadPdfs).toBe(true);
    expect(appConfig.requestTimeoutMs).toBe(30000);
    expect(appConfig.baseDelayMs).toBe(1500);
    expect(appConfig.maxRetries).toBe(5);
    expect(appConfig.maxBackoffMs).toBe(60000);
    expect(appConfig.pdfConcurrency).toBe(1);
    expect(appConfig.logLevel).toBe('info');
  });

  it('throws a clear error when LOG_LEVEL is invalid', async () => {
    process.env.LOG_LEVEL = 'not-a-level';

    vi.resetModules();
    await expect(importAppConfig()).rejects.toThrow(/LOG_LEVEL/);
  });

  it('throws a clear error when MAX_PAGES is not numeric', async () => {
    process.env.MAX_PAGES = 'not-a-number';

    vi.resetModules();
    await expect(importAppConfig()).rejects.toThrow(/MAX_PAGES/);
  });

  it('throws a clear error when DOWNLOAD_PDFS is not a valid boolean literal', async () => {
    process.env.DOWNLOAD_PDFS = 'maybe';

    vi.resetModules();
    await expect(importAppConfig()).rejects.toThrow(/DOWNLOAD_PDFS/);
  });

  it('throws a clear error when BASE_URL is not a valid URL', async () => {
    process.env.BASE_URL = 'not-a-url';

    vi.resetModules();
    await expect(importAppConfig()).rejects.toThrow(/BASE_URL/);
  });
});
