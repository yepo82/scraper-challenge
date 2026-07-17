import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { logger } from '../utils/logger.js';
import { calculateBackoffDelay, RETRYABLE_ERROR_CODES, RETRYABLE_STATUS_CODES } from './retry-policy.js';
import { createRateLimiter } from './rate-limiter.js';

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
  Connection: 'keep-alive',
};

export interface HttpClientOptions {
  baseUrl?: string;
  timeoutMs: number;
  maxRetries: number;
  baseDelayMs: number;
  maxBackoffMs: number;
  minTimeBetweenRequestsMs: number;
  userAgent?: string;
}

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  responseType?: 'text' | 'json' | 'arraybuffer';
  referer?: string;
  origin?: string;
}

export interface HttpResponse<T = string> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

export class HttpRequestError extends Error {
  readonly url: string;
  readonly method: string;
  readonly status?: number;
  readonly attempts: number;
  readonly cause?: unknown;

  constructor(
    message: string,
    details: { url: string; method: string; status?: number; attempts: number; cause?: unknown },
  ) {
    super(message);
    this.name = 'HttpRequestError';
    this.url = details.url;
    this.method = details.method;
    this.status = details.status;
    this.attempts = details.attempts;
    this.cause = details.cause;
  }
}

// Hallazgo empírico contra el sitio real (Fase 5): el Location de la redirección 302 tras el
// POST de búsqueda usa http:// (quirk del servidor/proxy real, jurisprudencia.pj.gob.pe), pero
// el origin real solo acepta HTTPS -- el puerto 80 devuelve connection-refused. axios (vía
// follow-redirects) NO hace este upgrade por sí solo: hay que forzarlo con el hook
// beforeRedirect, mutando las opciones de la petición redirigida antes de que se dispare.
//
// El upgrade solo se aplica si la petición que originó la redirección ya era https: forzar
// siempre a https rompería sitios legítimamente http-only. Limitarlo a "nunca degradar una
// petición que empezó segura" es una política general y correcta (evita downgrade de protocolo
// vía redirect), no un parche específico del sitio.
export function upgradeInsecureRedirectProtocol(
  options: { protocol?: string; port?: string | number },
  _responseDetails?: unknown,
  requestDetails?: { url?: string },
): void {
  const originWasSecure = requestDetails?.url?.startsWith('https:') ?? false;
  if (originWasSecure && options.protocol === 'http:') {
    options.protocol = 'https:';
    options.port = '';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Buffer.isBuffer(value) &&
    !(value instanceof URLSearchParams)
  );
}

function buildRequestHeaders(
  options: HttpRequestOptions | undefined,
  userAgent: string | undefined,
): Record<string, string> {
  const headers: Record<string, string> = {
    ...DEFAULT_HEADERS,
    ...(userAgent ? { 'User-Agent': userAgent } : {}),
    ...options?.headers,
  };

  if (options?.referer) {
    headers.Referer = options.referer;
  }
  if (options?.origin) {
    headers.Origin = options.origin;
  }

  return headers;
}

export class HttpClient {
  private readonly axiosInstance: AxiosInstance;
  private readonly limiter: ReturnType<typeof createRateLimiter>;
  private readonly options: HttpClientOptions;

  constructor(options: HttpClientOptions) {
    this.options = options;
    const jar = new CookieJar();
    // axios-cookiejar-support augmenta AxiosRequestConfig (no CreateAxiosDefaults) con `jar`,
    // así que axios.create() no lo reconoce por typing aunque el patrón sea el documentado.
    this.axiosInstance = wrapper(
      axios.create({
        baseURL: options.baseUrl,
        jar,
        timeout: options.timeoutMs,
        validateStatus: () => true,
        beforeRedirect: upgradeInsecureRedirectProtocol,
      } as AxiosRequestConfig),
    );
    this.limiter = createRateLimiter(options.minTimeBetweenRequestsMs);
  }

  async get<T = string>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    return this.requestWithRetry<T>({
      method: 'GET',
      url,
      headers: buildRequestHeaders(options, this.options.userAgent),
      responseType: options?.responseType === 'json' ? 'json' : 'text',
    });
  }

  async post<T = string>(
    url: string,
    data: unknown,
    options?: HttpRequestOptions,
  ): Promise<HttpResponse<T>> {
    const headers = buildRequestHeaders(options, this.options.userAgent);
    let body = data;

    if (isPlainObject(data)) {
      body = new URLSearchParams(data as Record<string, string>).toString();
      const hasContentType = Object.keys(headers).some(
        (key) => key.toLowerCase() === 'content-type',
      );
      if (!hasContentType) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }

    return this.requestWithRetry<T>({
      method: 'POST',
      url,
      data: body,
      headers,
      responseType: options?.responseType === 'json' ? 'json' : 'text',
    });
  }

  async download(url: string, options?: HttpRequestOptions): Promise<Buffer> {
    const response = await this.requestWithRetry<ArrayBuffer>({
      method: 'GET',
      url,
      headers: buildRequestHeaders(options, this.options.userAgent),
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data);
  }

  private async requestWithRetry<T>(config: AxiosRequestConfig): Promise<HttpResponse<T>> {
    const method = (config.method ?? 'GET').toUpperCase();
    const url = config.url ?? '';
    let attempt = 1;

    for (;;) {
      let response: AxiosResponse<T>;

      try {
        response = await this.limiter.schedule(() => this.axiosInstance.request<T>(config));
      } catch (error) {
        const errorCode = (error as { code?: string }).code;
        if (errorCode && RETRYABLE_ERROR_CODES.includes(errorCode) && attempt <= this.options.maxRetries) {
          logger.warn({ method, url, attempt, errorCode }, 'Network error, retrying request');
          const delay = calculateBackoffDelay({
            attempt,
            baseDelayMs: this.options.baseDelayMs,
            maxBackoffMs: this.options.maxBackoffMs,
          });
          logger.warn({ method, url, attempt, delay }, 'Waiting before retry');
          await sleep(delay);
          attempt += 1;
          continue;
        }

        logger.error({ method, url, attempt, error }, 'Request failed with a network error');
        throw new HttpRequestError(`Request to ${url} failed: ${(error as Error).message}`, {
          url,
          method,
          attempts: attempt,
          cause: error,
        });
      }

      if (RETRYABLE_STATUS_CODES.includes(response.status) && attempt <= this.options.maxRetries) {
        logger.warn({ method, url, status: response.status, attempt }, 'Retryable status received');
        const delay = calculateBackoffDelay({
          attempt,
          baseDelayMs: this.options.baseDelayMs,
          maxBackoffMs: this.options.maxBackoffMs,
          retryAfterHeader: response.headers['retry-after'] as string | undefined,
        });
        logger.warn({ method, url, attempt, delay }, 'Waiting before retry');
        await sleep(delay);
        attempt += 1;
        continue;
      }

      if (response.status >= 400) {
        logger.error(
          { method, url, status: response.status, attempt },
          'Request failed with a non-retryable or exhausted-retries status',
        );
        throw new HttpRequestError(`Request to ${url} failed with status ${response.status}`, {
          url,
          method,
          status: response.status,
          attempts: attempt,
        });
      }

      logger.debug({ method, url, status: response.status, attempt }, 'Request succeeded');
      return {
        data: response.data,
        status: response.status,
        headers: response.headers as Record<string, string>,
      };
    }
  }
}
