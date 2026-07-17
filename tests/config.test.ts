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

async function importEnv() {
  const mod = await import('../src/config.js');
  return mod.env;
}

describe('env', () => {
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
    const env = await importEnv();

    expect(env.BASE_URL).toBe('https://example.test/page');
    expect(env.OUTPUT_DIR).toBe('./custom-output');
    expect(env.MAX_PAGES).toBe(10);
    expect(typeof env.MAX_PAGES).toBe('number');
    expect(env.MAX_DOCUMENTS).toBe(100);
    expect(env.DOWNLOAD_PDFS).toBe(false);
    expect(typeof env.DOWNLOAD_PDFS).toBe('boolean');
    expect(env.REQUEST_TIMEOUT_MS).toBe(15000);
    expect(env.BASE_DELAY_MS).toBe(2000);
    expect(env.MAX_RETRIES).toBe(7);
    expect(env.MAX_BACKOFF_MS).toBe(30000);
    expect(env.PDF_CONCURRENCY).toBe(4);
    expect(env.LOG_LEVEL).toBe('debug');
  });

  it('applies sane defaults when optional vars are not set', async () => {
    vi.resetModules();
    const env = await importEnv();

    expect(env.BASE_URL).toBe(
      'https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/inicio.xhtml',
    );
    expect(env.OUTPUT_DIR).toBe('output');
    expect(env.MAX_PAGES).toBe(3);
    expect(env.MAX_DOCUMENTS).toBe(30);
    expect(env.DOWNLOAD_PDFS).toBe(true);
    expect(env.REQUEST_TIMEOUT_MS).toBe(30000);
    expect(env.BASE_DELAY_MS).toBe(1500);
    expect(env.MAX_RETRIES).toBe(5);
    expect(env.MAX_BACKOFF_MS).toBe(60000);
    expect(env.PDF_CONCURRENCY).toBe(1);
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('throws a clear error when LOG_LEVEL is invalid', async () => {
    process.env.LOG_LEVEL = 'not-a-level';

    vi.resetModules();
    await expect(importEnv()).rejects.toThrow(/LOG_LEVEL/);
  });

  it('throws a clear error when MAX_PAGES is not numeric', async () => {
    process.env.MAX_PAGES = 'not-a-number';

    vi.resetModules();
    await expect(importEnv()).rejects.toThrow(/MAX_PAGES/);
  });

  it('throws a clear error when DOWNLOAD_PDFS is not a valid boolean literal', async () => {
    process.env.DOWNLOAD_PDFS = 'maybe';

    vi.resetModules();
    await expect(importEnv()).rejects.toThrow(/DOWNLOAD_PDFS/);
  });

  it('throws a clear error when BASE_URL is not a valid URL', async () => {
    process.env.BASE_URL = 'not-a-url';

    vi.resetModules();
    await expect(importEnv()).rejects.toThrow(/BASE_URL/);
  });
});
