import { appConfig } from './config.js';
import { logger } from './utils/logger.js';
import { parseCliArgs } from './cli/args.js';
import { HttpClient } from './http/http-client.js';
import { Scraper } from './scraper/scraper.js';

async function main(): Promise<void> {
  const invocation = parseCliArgs(process.argv, appConfig);

  if (invocation.command === 'scrape') {
    const effectiveConfig = { ...appConfig, ...invocation.options };
    logger.info('Scraper iniciado');
    logger.info(effectiveConfig, 'Configuración efectiva');

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
    const scraper = new Scraper(httpClient, appConfig);
    await scraper.run(invocation.options);
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
