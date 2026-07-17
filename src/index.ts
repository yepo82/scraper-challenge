import { Command, InvalidArgumentError } from 'commander';
import { env } from './config.js';
import { logger } from './utils/logger.js';
import type { ScrapeCommandOptions } from './types.js';

function parseIntOption(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new InvalidArgumentError(`"${value}" no es un número entero válido.`);
  }
  return parsed;
}

function parseBooleanOption(value: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new InvalidArgumentError(`"${value}" no es válido, se espera "true" o "false".`);
}

const program = new Command();

program.name('pj-jurisprudencia-scraper').description('Scraper HTTP para jurisprudencia.pj.gob.pe');

program
  .command('scrape')
  .description('Ejecuta el proceso de scraping')
  .option('--max-pages <n>', 'cantidad máxima de páginas a recorrer', parseIntOption, env.MAX_PAGES)
  .option(
    '--max-documents <n>',
    'cantidad máxima de documentos a procesar',
    parseIntOption,
    env.MAX_DOCUMENTS,
  )
  .option(
    '--download-pdfs <bool>',
    'si se deben descargar los PDFs (true|false)',
    parseBooleanOption,
    env.DOWNLOAD_PDFS,
  )
  .option('--dry-run', 'ejecuta sin realizar peticiones reales', false)
  .action((options: ScrapeCommandOptions) => {
    logger.info('Scraper iniciado');
    logger.info(options, 'Opciones de scraping resueltas');
  });

program
  .command('retry-failed')
  .description('Reintenta los documentos que fallaron en corridas previas')
  .action(() => {
    logger.info('Reintento de documentos fallidos iniciado');
  });

program.parse(process.argv);
