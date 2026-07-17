export interface CalculateBackoffDelayParams {
  attempt: number; // 1-indexed: 1 = primer reintento
  baseDelayMs: number;
  maxBackoffMs: number;
  retryAfterHeader?: string | null;
}

export const RETRYABLE_STATUS_CODES: readonly number[] = [429, 408, 500, 502, 503, 504];
export const RETRYABLE_ERROR_CODES: readonly string[] = ['ECONNRESET', 'ETIMEDOUT'];

const DELTA_SECONDS_PATTERN = /^\d+$/;

/**
 * Parsea el header Retry-After según RFC 7231: puede ser delta-seconds o una fecha HTTP.
 * Devuelve null si el header es inválido o el delay resultante no es positivo,
 * para que el caller pueda caer al backoff exponencial en vez de esperar un valor absurdo.
 */
function parseRetryAfterHeader(header: string): number | null {
  let delayMs: number;

  if (DELTA_SECONDS_PATTERN.test(header)) {
    delayMs = Number(header) * 1000;
  } else {
    const parsedDate = Date.parse(header);
    if (Number.isNaN(parsedDate)) {
      return null;
    }
    delayMs = parsedDate - Date.now();
  }

  return delayMs > 0 ? delayMs : null;
}

export function calculateBackoffDelay(params: CalculateBackoffDelayParams): number {
  const { attempt, baseDelayMs, maxBackoffMs, retryAfterHeader } = params;

  if (retryAfterHeader) {
    const delayMs = parseRetryAfterHeader(retryAfterHeader);
    if (delayMs !== null) {
      // Sin jitter: el servidor nos dijo exactamente cuánto esperar, no estamos adivinando.
      return Math.min(Math.round(delayMs), maxBackoffMs);
    }
  }

  const raw = baseDelayMs * 2 ** (attempt - 1);
  const capped = Math.min(raw, maxBackoffMs);
  const jitterFactor = 1 + (Math.random() * 0.5 - 0.25);
  const jittered = capped * jitterFactor;

  // Re-cap después del jitter: si capped ya estaba en el tope y el factor > 1, se pasaría.
  return Math.min(Math.round(Math.max(jittered, 0)), maxBackoffMs);
}
