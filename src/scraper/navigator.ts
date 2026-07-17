import type { HttpClient } from '../http/http-client.js';
import { JsfSession } from '../jsf/jsf-session.js';
import { buildJsfPayload, extractOnclickParams } from '../jsf/payload-builder.js';
import { isPartialResponseBody, parsePartialResponse } from '../jsf/partial-response.js';
import type { DiscoveryCandidateButton, SearchPageResult, SiteDiscoveryReport } from '../types.js';
import { savePageHtml, saveSearchResponse } from '../storage/file-store.js';
import { logger } from '../utils/logger.js';
import { discoverSiteStructure } from './discovery.js';

export interface SearchNavigatorConfig {
  outputDir: string;
  searchButtonId?: string;
}

function matchesJsfcljsForward(button: DiscoveryCandidateButton): boolean {
  const onclick = button.onclick?.toLowerCase() ?? '';
  return onclick.includes('jsfcljs') && onclick.includes('forward');
}

function matchesBuscarKeyword(button: DiscoveryCandidateButton): boolean {
  const haystacks = [button.onclick, button.id, button.name, button.text];
  return haystacks.some((value) => value?.toLowerCase().includes('buscar'));
}

// Hallazgo empírico contra el sitio real (Fase 5): el `action` del form embebe
// ";jsessionid=..." como matrix parameter (URL rewriting clásico de Servlet/JSF para clientes
// sin cookies). El HttpClient de este proyecto ya persiste la sesión vía cookie jar, y postear
// literalmente a esa URL con el segmento ;jsessionid=... devuelve 500 en el sitio real aunque la
// cookie sea válida; postear a la misma ruta sin ese segmento funciona (302). Se descarta acá.
const JSESSIONID_SEGMENT_PATTERN = /;jsessionid=[^/?#]*/i;

function stripJsessionId(url: string): string {
  return url.replace(JSESSIONID_SEGMENT_PATTERN, '');
}

/**
 * Extrae el HTML "usable" de una partial-response XML concatenando el contenido de los
 * <update> que no son el ViewState. No hay hoy un flujo real que ejercite esta rama (Fase 5
 * confirmó que la búsqueda es un POST/redirect síncrono, no AJAX), pero se mantiene por si un
 * futuro endpoint sí responde en formato partial-response.
 */
function extractHtmlFromPartialResponse(xml: string): string {
  const { updates } = parsePartialResponse(xml);
  return updates
    .filter((update) => update.id !== 'javax.faces.ViewState')
    .map((update) => update.content)
    .join('\n');
}

export class SearchNavigator {
  constructor(
    private readonly session: JsfSession,
    private readonly httpClient: HttpClient,
    private readonly config: SearchNavigatorConfig,
    private readonly discoveryReport: SiteDiscoveryReport,
  ) {}

  async searchInitial(): Promise<SearchPageResult> {
    const button = this.selectSearchButton();
    const onclickParams = extractOnclickParams(button.onclick ?? '');

    const payload = buildJsfPayload({
      formId: this.session.getFormId(),
      viewState: this.session.getViewState(),
      params: { ...this.discoveryReport.hiddenInputs, ...onclickParams },
    });

    const postUrl = stripJsessionId(this.session.getFormAction());
    const response = await this.httpClient.post(postUrl, payload);

    const html = isPartialResponseBody(response.data)
      ? extractHtmlFromPartialResponse(response.data)
      : response.data;

    this.session.updateFromResponse(response.data);
    const viewState = this.session.getViewState();

    const hasResults = discoverSiteStructure(html).candidateTables.some((table) => table.rowCount > 1);
    if (!hasResults) {
      logger.warn(
        'No se detectaron resultados en la respuesta de búsqueda; esto es esperado para una búsqueda sin criterios y no se trata como un error',
      );
    }

    const searchResponsePath = await saveSearchResponse(this.config.outputDir, response.data);
    logger.info({ path: searchResponsePath }, 'Respuesta de búsqueda guardada');

    if (html.length > 0) {
      const pageHtmlPath = await savePageHtml(this.config.outputDir, 1, html);
      logger.info({ path: pageHtmlPath }, 'Página de resultados guardada');
    }

    return {
      pageNumber: 1,
      html,
      rawResponse: response.data,
      viewState,
      discoveredAt: new Date().toISOString(),
    };
  }

  private selectSearchButton(): DiscoveryCandidateButton {
    const candidates = this.discoveryReport.candidateSearchButtons;

    if (this.config.searchButtonId !== undefined) {
      const configuredId = this.config.searchButtonId;
      const configured = candidates.find(
        (candidate) => candidate.id === configuredId || candidate.name === configuredId,
      );
      if (!configured) {
        throw new Error(
          `SEARCH_BUTTON_ID="${configuredId}" no fue encontrado entre los candidateSearchButtons del discovery; revisá el valor configurado.`,
        );
      }
      logger.info(
        { id: configured.id, name: configured.name, strategy: 'SEARCH_BUTTON_ID override' },
        'Botón de búsqueda seleccionado',
      );
      return configured;
    }

    const jsfcljsMatch = candidates.find(matchesJsfcljsForward);
    if (jsfcljsMatch) {
      logger.info(
        { id: jsfcljsMatch.id, name: jsfcljsMatch.name, strategy: 'jsfcljs+forward en onclick' },
        'Botón de búsqueda seleccionado',
      );
      return jsfcljsMatch;
    }

    const buscarMatch = candidates.find(matchesBuscarKeyword);
    if (buscarMatch) {
      logger.info(
        { id: buscarMatch.id, name: buscarMatch.name, strategy: 'palabra clave "buscar"' },
        'Botón de búsqueda seleccionado',
      );
      return buscarMatch;
    }

    const looseMatch = candidates.find((candidate) => candidate.name !== undefined && candidate.onclick !== undefined);
    if (looseMatch) {
      logger.info(
        { id: looseMatch.id, name: looseMatch.name, strategy: 'primer candidato con name+onclick' },
        'Botón de búsqueda seleccionado',
      );
      return looseMatch;
    }

    throw new Error(
      'No se encontró ningún candidateSearchButton viable en el discovery para disparar la búsqueda; ' +
        'configurá SEARCH_BUTTON_ID para forzar un id/name específico.',
    );
  }
}
