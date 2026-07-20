import type { AppConfig, ScrapeCommandOptions } from '../types.js';
import type { HttpClient } from '../http/http-client.js';
import { JsfSession } from '../jsf/jsf-session.js';
import { discoverSiteStructure } from './discovery.js';
import { SearchNavigator } from './navigator.js';
import { parseDocumentsFromResultsHtml } from './parser.js';
import { saveInitialPageHtml, saveDiscoveryReport } from '../storage/file-store.js';
import { saveDocuments } from '../storage/document-store.js';
import { logger } from '../utils/logger.js';

export class Scraper {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly appConfig: AppConfig,
  ) {}

  async run(_options: ScrapeCommandOptions): Promise<void> {
    // El discovery de reconocimiento corre siempre, incluso en --dry-run: dry-run acá
    // significa "no hacer scraping/descarga real de múltiples páginas" (que todavía no existe),
    // no "saltear el reconocimiento inicial".
    const session = new JsfSession(this.httpClient, { baseUrl: this.appConfig.baseUrl });
    const initialState = await session.initialize();

    const initialPagePath = await saveInitialPageHtml(this.appConfig.outputDir, initialState.html);
    logger.info({ path: initialPagePath }, 'Página inicial guardada');

    const discoveryReport = discoverSiteStructure(initialState.html);
    const discoveryReportPath = await saveDiscoveryReport(this.appConfig.outputDir, discoveryReport);
    logger.info({ path: discoveryReportPath }, 'Reporte de discovery guardado');

    logger.info(
      {
        formId: discoveryReport.formId,
        hiddenInputCount: Object.keys(discoveryReport.hiddenInputs).length,
        searchButtonCount: discoveryReport.candidateSearchButtons.length,
        tableCount: discoveryReport.candidateTables.length,
        paginatorCount: discoveryReport.candidatePaginators.length,
        pdfControlCount: discoveryReport.candidatePdfControls.length,
      },
      'Resumen de discovery',
    );

    // Fase 5, integración temporal: dispara la búsqueda inicial (sin criterios) para probar
    // la mecánica POST/ViewState/payload end-to-end. La orquestación completa de paginación
    // y extracción de documentos queda para una fase posterior.
    const navigator = new SearchNavigator(
      session,
      this.httpClient,
      { outputDir: this.appConfig.outputDir, searchButtonId: this.appConfig.searchButtonId },
      discoveryReport,
    );
    const searchResult = await navigator.searchInitial();

    const resultsDetected = discoverSiteStructure(searchResult.html).candidateTables.some(
      (table) => table.rowCount > 1,
    );

    logger.info(
      {
        pageNumber: searchResult.pageNumber,
        viewState: searchResult.viewState,
        htmlLength: searchResult.html.length,
        resultsDetected,
      },
      'Búsqueda inicial completada',
    );

    const documents = parseDocumentsFromResultsHtml(searchResult.html, {
      pageNumber: searchResult.pageNumber,
    });
    const { jsonPath, csvPath } = await saveDocuments(this.appConfig.outputDir, documents);
    logger.info({ jsonPath, csvPath, documentCount: documents.length }, 'Documentos guardados');
  }
}
