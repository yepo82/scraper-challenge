import type { AppConfig, ScrapeCommandOptions, SearchPageResult } from '../types.js';
import type { HttpClient } from '../http/http-client.js';
import { JsfSession } from '../jsf/jsf-session.js';
import { discoverSiteStructure } from './discovery.js';
import { SearchNavigator } from './navigator.js';
import { parseDocumentsFromResultsHtml } from './parser.js';
import { saveInitialPageHtml, saveDiscoveryReport } from '../storage/file-store.js';
import { loadDocuments, saveDocuments } from '../storage/document-store.js';
import { logger } from '../utils/logger.js';

type StopReason =
  | 'maxPages'
  | 'maxDocuments'
  | 'noMorePages'
  | 'emptyPage'
  | 'allDocumentsAlreadySeen'
  | 'unrecoverableError';

export class Scraper {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly appConfig: AppConfig,
  ) {}

  async run(options: ScrapeCommandOptions): Promise<void> {
    // El discovery de reconocimiento corre siempre, incluso en --dry-run: dry-run acá
    // significa "no descargar PDFs reales" (todavía no implementado), no "saltear el
    // reconocimiento inicial ni la paginación".
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

    const navigator = new SearchNavigator(
      session,
      this.httpClient,
      {
        outputDir: this.appConfig.outputDir,
        searchButtonId: this.appConfig.searchButtonId,
        resultsTableId: this.appConfig.resultsTableId,
        paginatorId: this.appConfig.paginatorId,
      },
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

    // Set en memoria de ids ya vistos, sembrado con los ids ya persistidos en documents.json de
    // corridas anteriores: esto extiende la deduplicación intra-corrida del enunciado a también
    // respetar el estado ya guardado en disco, habilitando un re-scrape incremental razonable
    // (una página cuyos documentos ya estén todos en documents.json de una corrida previa se
    // trata igual que una página "toda duplicada" dentro de la misma corrida).
    const seenDocumentIds = new Set<string>();
    for (const document of await loadDocuments(this.appConfig.outputDir)) {
      seenDocumentIds.add(document.id);
    }

    let currentPage: SearchPageResult | null = searchResult;
    let totalNewDocuments = 0;
    let stopReason: StopReason | undefined;

    while (currentPage) {
      const documents = parseDocumentsFromResultsHtml(currentPage.html, {
        pageNumber: currentPage.pageNumber,
      });

      const newDocuments = documents.filter((document) => !seenDocumentIds.has(document.id));
      for (const document of newDocuments) {
        seenDocumentIds.add(document.id);
      }
      totalNewDocuments += newDocuments.length;

      // Se guarda la lista completa de documentos parseados de la página (no solo los nuevos):
      // saveDocuments() ya deduplica por id contra lo persistido, así que filtrar acá sería
      // redundante y mezclaría lógica de storage con las condiciones de parada de este loop.
      const { jsonPath, csvPath } = await saveDocuments(this.appConfig.outputDir, documents);
      logger.info(
        {
          pageNumber: currentPage.pageNumber,
          documentsExtracted: documents.length,
          newDocuments: newDocuments.length,
          duplicates: documents.length - newDocuments.length,
          jsonPath,
          csvPath,
        },
        'Página de resultados procesada',
      );

      if (documents.length === 0) {
        stopReason = 'emptyPage';
        break;
      }
      if (newDocuments.length === 0) {
        stopReason = 'allDocumentsAlreadySeen';
        break;
      }
      if (currentPage.pageNumber >= options.maxPages) {
        stopReason = 'maxPages';
        break;
      }
      if (totalNewDocuments >= options.maxDocuments) {
        stopReason = 'maxDocuments';
        break;
      }

      // Se captura antes del try: TS pierde el narrowing "currentPage no es null" dentro del
      // catch porque la asignación de abajo puede fallar a mitad de camino.
      const pageNumberBeingFetched = currentPage.pageNumber;
      try {
        currentPage = await navigator.getNextPage(currentPage);
      } catch (error) {
        // No se relanza: el progreso de las páginas ya procesadas (guardado arriba en cada
        // iteración) debe seguir siendo válido aunque la paginación se corte acá.
        logger.error(
          { error, pageNumber: pageNumberBeingFetched },
          'Error no recuperable al pedir la siguiente página; se detiene la paginación conservando el progreso ya guardado',
        );
        stopReason = 'unrecoverableError';
        break;
      }

      if (!currentPage) {
        stopReason = 'noMorePages';
      }
    }

    logger.info({ stopReason, totalNewDocuments }, 'Paginación finalizada');
  }
}
