import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type {
  DiscoveryCandidateButton,
  DiscoveryCandidatePaginator,
  DiscoveryCandidatePdfControl,
  DiscoveryCandidateTable,
  SiteDiscoveryReport,
} from '../types.js';
import { logger } from '../utils/logger.js';

const AJAX_TRIGGER_KEYWORDS = ['jsf', 'mojarra', 'richfaces', 'primefaces', 'ajax'];
const PAGINATOR_CLASS_OR_ID_KEYWORDS = ['pag', 'rf-ds', 'rf-dp', 'ui-paginator'];

function containsKeyword(value: string | undefined, keywords: string[]): boolean {
  if (!value) return false;
  const lowered = value.toLowerCase();
  return keywords.some((keyword) => lowered.includes(keyword));
}

/**
 * Reutiliza la misma heurística que JsfSession.initialize() (Fase 3): el formulario principal
 * es el que envuelve al input javax.faces.ViewState. A diferencia de JsfSession, discovery es
 * diagnóstico best-effort, así que acá nunca se lanza: si no hay ViewState se cae al primer
 * <form> de la página, y si tampoco hay formulario se reporta null con un warning.
 */
function detectMainForm($: cheerio.CheerioAPI): cheerio.Cheerio<AnyNode> | null {
  const viewStateInput = $('input[name="javax.faces.ViewState"]');
  if (viewStateInput.length > 0) {
    const form = viewStateInput.closest('form');
    if (form.length > 0) {
      return form;
    }
  }

  const firstForm = $('form').first();
  if (firstForm.length > 0) {
    return firstForm;
  }

  return null;
}

function extractHiddenInputs(
  $: cheerio.CheerioAPI,
  scope: cheerio.Cheerio<AnyNode>,
): Record<string, string> {
  const hiddenInputs: Record<string, string> = {};

  scope.find('input[type="hidden"]').each((_, element) => {
    const input = $(element);
    const name = input.attr('name');
    if (!name) return;
    // El fixture real del sitio tiene inputs ocultos sin atributo `value`; cheerio devuelve
    // `undefined` en ese caso y hay que normalizarlo a '' para no filtrar "undefined" a downstream.
    hiddenInputs[name] = input.attr('value') ?? '';
  });

  return hiddenInputs;
}

function extractButtonText($: cheerio.CheerioAPI, element: AnyNode): string | undefined {
  const el = $(element);
  const text = el.text().trim();
  if (text) return text;

  const fallback = el.attr('value') ?? el.attr('alt') ?? el.attr('title');
  return fallback && fallback.trim() ? fallback.trim() : undefined;
}

function extractCandidateSearchButtons(
  $: cheerio.CheerioAPI,
): DiscoveryCandidateButton[] {
  const candidates: DiscoveryCandidateButton[] = [];
  const selector = 'button, input[type="submit"], input[type="button"], input[type="image"]';

  $(selector).each((_, element) => {
    candidates.push(buildButtonCandidate($, element));
  });

  $('a').each((_, element) => {
    const onclick = $(element).attr('onclick');
    if (containsKeyword(onclick, AJAX_TRIGGER_KEYWORDS)) {
      candidates.push(buildButtonCandidate($, element));
    }
  });

  if (candidates.length === 0) {
    logger.warn('No se encontraron botones/disparadores de búsqueda candidatos en la página');
  }

  return candidates;
}

function buildButtonCandidate($: cheerio.CheerioAPI, element: AnyNode): DiscoveryCandidateButton {
  const el = $(element);
  const candidate: DiscoveryCandidateButton = {};

  const id = el.attr('id');
  if (id) candidate.id = id;

  const name = el.attr('name');
  if (name) candidate.name = name;

  const text = extractButtonText($, element);
  if (text) candidate.text = text;

  const onclick = el.attr('onclick');
  if (onclick) candidate.onclick = onclick;

  return candidate;
}

function extractCandidateTables($: cheerio.CheerioAPI): DiscoveryCandidateTable[] {
  const tables: DiscoveryCandidateTable[] = [];

  $('table').each((_, element) => {
    const table = $(element);
    const headers = table
      .find('th')
      .map((__, th) => $(th).text().trim())
      .get();
    const rowCount = table.find('tr').length;

    const candidate: DiscoveryCandidateTable = { headers, rowCount };
    const id = table.attr('id');
    if (id) candidate.id = id;

    tables.push(candidate);
  });

  if (tables.length === 0) {
    logger.debug('No se encontraron tablas en la página (estado esperado antes de una búsqueda)');
  }

  return tables;
}

function extractCandidatePaginators($: cheerio.CheerioAPI): DiscoveryCandidatePaginator[] {
  const paginators: DiscoveryCandidatePaginator[] = [];

  $('*').each((_, element) => {
    const el = $(element);
    const classAttr = el.attr('class');
    const idAttr = el.attr('id');

    if (
      containsKeyword(classAttr, PAGINATOR_CLASS_OR_ID_KEYWORDS) ||
      containsKeyword(idAttr, PAGINATOR_CLASS_OR_ID_KEYWORDS)
    ) {
      const candidate: DiscoveryCandidatePaginator = {};
      if (idAttr) candidate.id = idAttr;
      const text = el.text().trim();
      if (text) candidate.text = text;
      paginators.push(candidate);
    }
  });

  if (paginators.length === 0) {
    logger.debug('No se encontraron paginadores en la página (estado esperado antes de una búsqueda)');
  }

  return paginators;
}

function extractCandidatePdfControls($: cheerio.CheerioAPI): DiscoveryCandidatePdfControl[] {
  const pdfControls: DiscoveryCandidatePdfControl[] = [];
  const seen = new Set<AnyNode>();

  $('a, button, input').each((_, element) => {
    const el = $(element);
    const href = el.attr('href');
    const onclick = el.attr('onclick');
    const text = el.text().trim();

    const hrefMatches = href ? /\.pdf$/i.test(href) || /pdf/i.test(href) : false;
    const onclickMatches = containsKeyword(onclick, ['pdf']);
    const textMatches = containsKeyword(text, ['pdf']);

    if (!hrefMatches && !onclickMatches && !textMatches) return;
    if (seen.has(element)) return;
    seen.add(element);

    const candidate: DiscoveryCandidatePdfControl = {};
    const id = el.attr('id');
    if (id) candidate.id = id;
    if (href) candidate.href = href;
    if (text) candidate.text = text;
    if (onclick) candidate.onclick = onclick;

    pdfControls.push(candidate);
  });

  if (pdfControls.length === 0) {
    logger.debug(
      'No se encontraron controles de descarga de PDF en la página (estado esperado antes de una búsqueda)',
    );
  }

  return pdfControls;
}

/**
 * Reconocimiento best-effort de la estructura de la página: nunca lanza, incluso ante HTML
 * vacío o sin formulario. Es diagnóstico (para guiar la navegación real de fases posteriores),
 * no un requisito duro como JsfSession.initialize().
 */
export function discoverSiteStructure(html: string): SiteDiscoveryReport {
  const $ = cheerio.load(html);

  const form = detectMainForm($);
  const formId = form?.attr('id') ?? null;
  if (!form) {
    logger.warn('No se encontró ningún <form> en la página durante el discovery');
  }

  const hiddenInputScope = form ?? $('html');

  return {
    formId,
    hiddenInputs: extractHiddenInputs($, hiddenInputScope),
    candidateSearchButtons: extractCandidateSearchButtons($),
    candidateTables: extractCandidateTables($),
    candidatePaginators: extractCandidatePaginators($),
    candidatePdfControls: extractCandidatePdfControls($),
  };
}
