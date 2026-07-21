import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { logger } from '../utils/logger.js';

export interface PaginatorInfo {
  paginatorId: string;
  availablePages: number[];
  hasMorePages: boolean;
}

const PAGE_NUMBER_LINK_CLASS = '.rf-ds-nmb-btn';

// Escapa caracteres especiales de regex en el paginatorId (p.ej. no debería tener ':' con
// significado especial en regex, pero mejor no asumirlo) antes de anclar patrones sobre él.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractAvailablePages(
  $: cheerio.CheerioAPI,
  paginator: cheerio.Cheerio<AnyNode>,
  paginatorId: string,
): number[] {
  const pageIdPattern = new RegExp(`^${escapeRegExp(paginatorId)}_ds_(\\d+)$`);
  const pages = new Set<number>();

  paginator.find(PAGE_NUMBER_LINK_CLASS).each((_, element) => {
    const id = $(element).attr('id');
    if (!id) return;
    const match = pageIdPattern.exec(id);
    if (!match) return;
    pages.add(Number(match[1]));
  });

  return Array.from(pages).sort((a, b) => a - b);
}

function detectHasMorePages(
  $: cheerio.CheerioAPI,
  paginator: cheerio.Cheerio<AnyNode>,
  paginatorId: string,
): boolean {
  const nextOrLastIdPattern = new RegExp(`^${escapeRegExp(paginatorId)}_ds_(next|l)$`);
  let found = false;

  paginator.find('[id]').each((_, element) => {
    if (found) return;
    const id = $(element).attr('id');
    if (id && nextOrLastIdPattern.test(id)) {
      found = true;
    }
  });

  return found;
}

function resolvePaginatorElement(
  $: cheerio.CheerioAPI,
  configuredId: string | undefined,
): { element: cheerio.Cheerio<AnyNode>; paginatorId: string } | null {
  if (configuredId !== undefined) {
    // Override explícito: si no calza con el HTML real, es una señal genuina de "no hay
    // paginador acá" (o el id configurado está mal), no un motivo para caer a auto-detección.
    const found = $(`[id="${configuredId}"]`);
    if (found.length === 0) {
      return null;
    }
    return { element: found.first(), paginatorId: configuredId };
  }

  const candidates = $('span.rf-ds[id]');
  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length > 1) {
    logger.warn(
      { count: candidates.length },
      'Se encontraron múltiples candidatos a paginador RichFaces (span.rf-ds[id]); se usa el primero',
    );
  }
  const element = candidates.first();
  const paginatorId = element.attr('id');
  // No debería poder pasar (el selector ya exige [id]), pero se guarda por completitud del tipo.
  if (!paginatorId) {
    return null;
  }
  return { element, paginatorId };
}

/**
 * Análisis puro de HTML (sin I/O): detecta el paginador RichFaces DataScroller de una página de
 * resultados. Best-effort por diseño (misma filosofía que discovery.ts/parser.ts): nunca lanza,
 * y si el paginador existe pero tiene una estructura inesperada devuelve un resultado vacío en
 * vez de crashear.
 */
export function detectPaginator(html: string, config?: { paginatorId?: string }): PaginatorInfo | null {
  const $ = cheerio.load(html);

  const resolved = resolvePaginatorElement($, config?.paginatorId);
  if (!resolved) {
    return null;
  }

  const { element, paginatorId } = resolved;

  return {
    paginatorId,
    availablePages: extractAvailablePages($, element, paginatorId),
    hasMorePages: detectHasMorePages($, element, paginatorId),
  };
}
