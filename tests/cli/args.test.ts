import { describe, expect, it } from 'vitest';
import { parseCliArgs } from '../../src/cli/args.js';
import type { AppConfig } from '../../src/types.js';

const fixtureAppConfig: AppConfig = {
  baseUrl: 'https://example.test/page',
  outputDir: 'output',
  maxPages: 3,
  maxDocuments: 30,
  downloadPdfs: true,
  requestTimeoutMs: 30000,
  baseDelayMs: 1500,
  maxRetries: 5,
  maxBackoffMs: 60000,
  pdfConcurrency: 1,
  logLevel: 'info',
};

function argv(...args: string[]): string[] {
  return ['node', 'pj-jurisprudencia-scraper', ...args];
}

describe('parseCliArgs', () => {
  it('falls back to appConfig values for scrape with no extra flags', () => {
    const invocation = parseCliArgs(argv('scrape'), fixtureAppConfig);

    expect(invocation.command).toBe('scrape');
    if (invocation.command !== 'scrape') throw new Error('unexpected command');
    expect(invocation.options.maxPages).toBe(fixtureAppConfig.maxPages);
    expect(invocation.options.maxDocuments).toBe(fixtureAppConfig.maxDocuments);
    expect(invocation.options.downloadPdfs).toBe(fixtureAppConfig.downloadPdfs);
    expect(invocation.options.dryRun).toBe(false);
    expect(invocation.options.resume).toBe(false);
  });

  it('overrides appConfig values when CLI flags are provided', () => {
    const invocation = parseCliArgs(
      argv('scrape', '--max-pages', '2', '--download-pdfs', 'false'),
      fixtureAppConfig,
    );

    expect(invocation.command).toBe('scrape');
    if (invocation.command !== 'scrape') throw new Error('unexpected command');
    expect(invocation.options.maxPages).toBe(2);
    expect(invocation.options.downloadPdfs).toBe(false);
  });

  it('sets both dryRun and resume to true when their flags are passed', () => {
    const invocation = parseCliArgs(argv('scrape', '--dry-run', '--resume'), fixtureAppConfig);

    expect(invocation.command).toBe('scrape');
    if (invocation.command !== 'scrape') throw new Error('unexpected command');
    expect(invocation.options.dryRun).toBe(true);
    expect(invocation.options.resume).toBe(true);
  });

  it('leaves limit undefined for retry-failed with no flags', () => {
    const invocation = parseCliArgs(argv('retry-failed'), fixtureAppConfig);

    expect(invocation.command).toBe('retry-failed');
    if (invocation.command !== 'retry-failed') throw new Error('unexpected command');
    expect(invocation.options.limit).toBeUndefined();
  });

  it('parses limit for retry-failed --limit 10', () => {
    const invocation = parseCliArgs(argv('retry-failed', '--limit', '10'), fixtureAppConfig);

    expect(invocation.command).toBe('retry-failed');
    if (invocation.command !== 'retry-failed') throw new Error('unexpected command');
    expect(invocation.options.limit).toBe(10);
  });

  it('throws instead of killing the process when a flag value is invalid', () => {
    expect(() => parseCliArgs(argv('scrape', '--max-pages', 'abc'), fixtureAppConfig)).toThrow();
  });
});
