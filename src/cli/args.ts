import { Command, CommanderError, InvalidArgumentError } from 'commander';
import type { AppConfig, RetryFailedCommandOptions, ScrapeCommandOptions } from '../types.js';

export type CliInvocation =
  | { command: 'scrape'; options: ScrapeCommandOptions }
  | { command: 'retry-failed'; options: RetryFailedCommandOptions };

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

export function parseCliArgs(argv: string[], appConfig: AppConfig): CliInvocation {
  let invocation: CliInvocation | undefined;

  const program = new Command();
  // exitOverride debe registrarse antes de crear subcomandos: Command.copyInheritedSettings
  // solo copia la configuración del padre en el momento en que se crea el subcomando.
  program.exitOverride();
  program.name('pj-jurisprudencia-scraper').description('Scraper HTTP para jurisprudencia.pj.gob.pe');

  program
    .command('scrape')
    .description('Ejecuta el proceso de scraping')
    .option('--max-pages <n>', 'cantidad máxima de páginas a recorrer', parseIntOption, appConfig.maxPages)
    .option(
      '--max-documents <n>',
      'cantidad máxima de documentos a procesar',
      parseIntOption,
      appConfig.maxDocuments,
    )
    .option(
      '--download-pdfs <bool>',
      'si se deben descargar los PDFs (true|false)',
      parseBooleanOption,
      appConfig.downloadPdfs,
    )
    .option('--dry-run', 'ejecuta sin realizar peticiones reales', false)
    .option('--resume', 'reanuda desde el último checkpoint guardado', false)
    .action((options: ScrapeCommandOptions) => {
      invocation = { command: 'scrape', options };
    });

  program
    .command('retry-failed')
    .description('Reintenta los documentos que fallaron en corridas previas')
    .option('--limit <n>', 'cantidad máxima de documentos a reintentar', parseIntOption)
    .action((options: RetryFailedCommandOptions) => {
      invocation = { command: 'retry-failed', options };
    });

  try {
    program.parse(argv);
  } catch (error) {
    if (error instanceof CommanderError) {
      throw new Error(error.message);
    }
    throw error;
  }

  if (!invocation) {
    throw new Error('No se especificó un comando válido.');
  }

  return invocation;
}
