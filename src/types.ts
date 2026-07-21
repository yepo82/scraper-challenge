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
  resultsTableId?: string;
  paginatorId?: string;
  // Validado y disponible para uso futuro: hoy NO está conectado al payload real de búsqueda.
  // El "tamaño de página" real (empíricamente 21) viaja como uno de los params extraídos del
  // onclick del botón de búsqueda (extractOnclickParams), bajo una key JSF autogenerada e
  // inestable (ej. "formBuscador:j_idt34"), no una key semántica estable como "pageSize". No hay
  // hoy forma confiable de identificar cuál de esas keys corresponde al tamaño de página para
  // sobreescribirla genéricamente; hacerlo a ciegas sería frágil. Queda como deuda de
  // investigación puntual para una fase futura.
  pageSize?: number;
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

export interface DocumentRecord {
  id: string;
  pageNumber: number;
  rowNumber: number;
  title?: string;
  expediente?: string;
  sala?: string;
  materia?: string;
  fecha?: string;
  tipoResolucion?: string;
  sumilla?: string;
  rawFields: Record<string, string>;
  pdfUrl?: string;
  pdfActionId?: string;
  pdfFilename: string;
  pdfStatus: 'pending' | 'downloaded' | 'failed' | 'skipped';
  scrapedAt: string; // ISO 8601
}
