export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export interface AppConfig {
  baseUrl: string;
  outputDir: string;
  maxPages: number;
  maxDocuments: number;
  downloadPdfs: boolean;
  requestTimeoutMs: number;
  baseDelayMs: number;
  maxRetries: number;
  maxBackoffMs: number;
  pdfConcurrency: number;
  logLevel: LogLevel;
}

export interface ScrapeCommandOptions {
  maxPages: number;
  maxDocuments: number;
  downloadPdfs: boolean;
  dryRun: boolean;
  resume: boolean;
}

export interface RetryFailedCommandOptions {
  limit?: number;
}

export interface JsfInitialState {
  html: string;
  viewState: string;
  formId: string;
  formAction: string;
}

export interface JsfPartialUpdate {
  id: string;
  content: string;
}

export interface JsfPayloadOptions {
  formId: string;
  viewState: string;
  params?: Record<string, string>;
  ajax?: {
    source: string;
    execute?: string;
    render?: string;
  };
}
