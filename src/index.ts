import { appConfig } from './config.js';
import { logger } from './utils/logger.js';
import { parseCliArgs } from './cli/args.js';
import { HttpClient } from './http/http-client.js';
import { JsfSession } from './jsf/jsf-session.js';
import { discoverSiteStructure } from './scraper/discovery.js';
import { saveInitialPageHtml, saveDiscoveryReport } from './storage/file-store.js';

async function main(): Promise<void> {
  const invocation = parseCliArgs(process.argv, appConfig);

  if (invocation.command === 'scrape') {
    const effectiveConfig = { ...appConfig, ...invocation.options };
    logger.info('Scraper iniciado');
    logger.info(effectiveConfig, 'Configuración efectiva');

    // El discovery de reconocimiento corre siempre, incluso en --dry-run: dry-run acá
    // significa "no hacer scraping/descarga real de múltiples páginas" (que todavía no existe),
    // no "saltear el reconocimiento inicial".
    const httpClient = new HttpClient({
      baseUrl: appConfig.baseUrl,
      timeoutMs: appConfig.requestTimeoutMs,
      maxRetries: appConfig.maxRetries,
      baseDelayMs: appConfig.baseDelayMs,
      maxBackoffMs: appConfig.maxBackoffMs,
      // No hay un campo de config dedicado para esto todavía; se reutiliza baseDelayMs
      // como decisión deliberada y diferida hasta que haga falta un valor propio.
      minTimeBetweenRequestsMs: appConfig.baseDelayMs,
    });
    const session = new JsfSession(httpClient, { baseUrl: appConfig.baseUrl });
    const initialState = await session.initialize();

    const initialPagePath = await saveInitialPageHtml(appConfig.outputDir, initialState.html);
    logger.info({ path: initialPagePath }, 'Página inicial guardada');

    const discoveryReport = discoverSiteStructure(initialState.html);
    const discoveryReportPath = await saveDiscoveryReport(appConfig.outputDir, discoveryReport);
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
  } else {
    logger.info('Reintento de documentos fallidos iniciado');
    if (invocation.options.limit !== undefined) {
      logger.info({ limit: invocation.options.limit }, 'Límite de reintentos configurado');
    }
  }
}

main().catch((error: unknown) => {
  logger.fatal(error, 'Fallo no controlado en la ejecución del CLI');
  process.exitCode = 1;
});
