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
  searchButtonId?: string;
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

export interface DiscoveryCandidateButton {
  id?: string;
  name?: string;
  text?: string;
  onclick?: string;
}

export interface DiscoveryCandidateTable {
  id?: string;
  headers: string[];
  rowCount: number;
}

export interface DiscoveryCandidatePaginator {
  id?: string;
  text?: string;
}

export interface DiscoveryCandidatePdfControl {
  id?: string;
  href?: string;
  text?: string;
  onclick?: string;
}

export interface SiteDiscoveryReport {
  formId: string | null;
  hiddenInputs: Record<string, string>;
  candidateSearchButtons: DiscoveryCandidateButton[];
  candidateTables: DiscoveryCandidateTable[];
  candidatePaginators: DiscoveryCandidatePaginator[];
  candidatePdfControls: DiscoveryCandidatePdfControl[];
}

export interface SearchPageResult {
  pageNumber: number;
  html: string;
  rawResponse: string;
  viewState: string;
  discoveredAt: string; // ISO 8601 timestamp
}
