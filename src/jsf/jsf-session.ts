import type { HttpClient } from '../http/http-client.js';
import type { JsfInitialState } from '../types.js';
import { extractViewStateFromHtml, extractViewStateFromPartialResponse } from './viewstate.js';
import { isPartialResponseBody } from './partial-response.js';
import * as cheerio from 'cheerio';

export interface JsfSessionConfig {
  baseUrl: string;
}

export class JsfSession {
  private state: JsfInitialState | undefined;
  private currentViewState: string | undefined;

  constructor(
    private readonly httpClient: HttpClient,
    private readonly config: JsfSessionConfig,
  ) {}

  async initialize(): Promise<JsfInitialState> {
    const response = await this.httpClient.get(this.config.baseUrl);
    const html = response.data;
    const $ = cheerio.load(html);

    const viewStateInput = $('input[name="javax.faces.ViewState"]');
    if (viewStateInput.length === 0) {
      throw new Error(
        `Could not find the javax.faces.ViewState input on ${this.config.baseUrl}; the JSF session cannot be initialized.`,
      );
    }
    const viewState = viewStateInput.attr('value');
    if (!viewState) {
      throw new Error(
        `The javax.faces.ViewState input on ${this.config.baseUrl} has no value; the JSF session cannot be initialized.`,
      );
    }

    const form = viewStateInput.closest('form');
    if (form.length === 0) {
      throw new Error(
        `Could not find the <form> element wrapping javax.faces.ViewState on ${this.config.baseUrl}; the JSF session cannot be initialized.`,
      );
    }

    const formId = form.attr('id');
    if (!formId) {
      throw new Error(
        `The main form on ${this.config.baseUrl} has no "id" attribute; the JSF session cannot be initialized.`,
      );
    }

    const formAction = form.attr('action');
    if (!formAction) {
      throw new Error(
        `The main form on ${this.config.baseUrl} has no "action" attribute; the JSF session cannot be initialized.`,
      );
    }

    this.state = { html, viewState, formId, formAction };
    this.currentViewState = viewState;

    return this.state;
  }

  getViewState(): string {
    if (this.currentViewState === undefined) {
      throw new Error('JsfSession.getViewState() called before initialize(); no ViewState is available yet.');
    }
    return this.currentViewState;
  }

  getFormId(): string {
    if (this.state === undefined) {
      throw new Error('JsfSession.getFormId() called before initialize(); no form is available yet.');
    }
    return this.state.formId;
  }

  getFormAction(): string {
    if (this.state === undefined) {
      throw new Error('JsfSession.getFormAction() called before initialize(); no form is available yet.');
    }
    // Se resuelve a una URL absoluta (no se devuelve el `action` crudo tal cual): hallazgo
    // empírico contra el sitio real (Fase 5) — cuando config.baseUrl ya incluye un path (no solo
    // el origin, como es el caso real: .../faces/page/inicio.xhtml) y se le pasa a axios una URL
    // relativa que arranca con "/", axios no la trata como "path absoluto que reemplaza todo el
    // path de baseURL": simplemente concatena baseURL + url, duplicando el path y produciendo un
    // 500 real del servidor. Devolver siempre una URL absoluta evita por completo que axios
    // combine baseURL con esta URL.
    return new URL(this.state.formAction, this.config.baseUrl).toString();
  }

  updateFromResponse(responseBody: string): void {
    const nextViewState = isPartialResponseBody(responseBody)
      ? extractViewStateFromPartialResponse(responseBody)
      : extractViewStateFromHtml(responseBody);

    if (nextViewState === null) {
      throw new Error(
        'Could not extract a fresh javax.faces.ViewState from the response body; the JSF session state is broken.',
      );
    }

    this.currentViewState = nextViewState;
  }
}
