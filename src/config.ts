import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import type { AppConfig } from './types.js';

loadDotenv();

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const booleanLiteral = z
  .string()
  .refine((value) => value === 'true' || value === 'false', {
    message: 'must be "true" or "false"',
  })
  .transform((value) => value === 'true');

const envSchema = z.object({
  BASE_URL: z
    .string()
    .url()
    .default('https://jurisprudencia.pj.gob.pe/jurisprudenciaweb/faces/page/inicio.xhtml'),
  OUTPUT_DIR: z.string().default('output'),
  MAX_PAGES: z.coerce.number().int().positive().default(3),
  MAX_DOCUMENTS: z.coerce.number().int().positive().default(30),
  DOWNLOAD_PDFS: booleanLiteral.default('true'),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  BASE_DELAY_MS: z.coerce.number().int().nonnegative().default(1500),
  MAX_RETRIES: z.coerce.number().int().positive().default(5),
  MAX_BACKOFF_MS: z.coerce.number().int().positive().default(60000),
  PDF_CONCURRENCY: z.coerce.number().int().positive().default(1),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  SEARCH_BUTTON_ID: z.string().optional(),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}

const parsed = parseEnv();

export const appConfig: AppConfig = {
  baseUrl: parsed.BASE_URL,
  outputDir: parsed.OUTPUT_DIR,
  maxPages: parsed.MAX_PAGES,
  maxDocuments: parsed.MAX_DOCUMENTS,
  downloadPdfs: parsed.DOWNLOAD_PDFS,
  requestTimeoutMs: parsed.REQUEST_TIMEOUT_MS,
  baseDelayMs: parsed.BASE_DELAY_MS,
  maxRetries: parsed.MAX_RETRIES,
  maxBackoffMs: parsed.MAX_BACKOFF_MS,
  pdfConcurrency: parsed.PDF_CONCURRENCY,
  logLevel: parsed.LOG_LEVEL,
  searchButtonId: parsed.SEARCH_BUTTON_ID,
};
