import { appConfig } from './config.js';
import { logger } from './utils/logger.js';
import { parseCliArgs } from './cli/args.js';

const invocation = parseCliArgs(process.argv, appConfig);

if (invocation.command === 'scrape') {
  const effectiveConfig = { ...appConfig, ...invocation.options };
  logger.info('Scraper iniciado');
  logger.info(effectiveConfig, 'Configuración efectiva');
} else {
  logger.info('Reintento de documentos fallidos iniciado');
  if (invocation.options.limit !== undefined) {
    logger.info({ limit: invocation.options.limit }, 'Límite de reintentos configurado');
  }
}
