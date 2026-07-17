import { describe, expect, it } from 'vitest';
import { calculateBackoffDelay } from '../src/http/retry-policy.js';

describe('calculateBackoffDelay', () => {
  it('applies exponential backoff with jitter for attempt 1 (base 1000ms -> [750, 1250])', () => {
    for (let i = 0; i < 50; i += 1) {
      const delay = calculateBackoffDelay({ attempt: 1, baseDelayMs: 1000, maxBackoffMs: 60000 });
      expect(delay).toBeGreaterThanOrEqual(750);
      expect(delay).toBeLessThanOrEqual(1250);
    }
  });

  it('applies exponential backoff with jitter for attempt 3 (base*4=4000 -> [3000, 5000])', () => {
    for (let i = 0; i < 50; i += 1) {
      const delay = calculateBackoffDelay({ attempt: 3, baseDelayMs: 1000, maxBackoffMs: 60000 });
      expect(delay).toBeGreaterThanOrEqual(3000);
      expect(delay).toBeLessThanOrEqual(5000);
    }
  });

  it('returns the exact delta-seconds value from a numeric Retry-After header without jitter', () => {
    const delay = calculateBackoffDelay({
      attempt: 1,
      baseDelayMs: 1000,
      maxBackoffMs: 60000,
      retryAfterHeader: '5',
    });
    expect(delay).toBe(5000);
  });

  it('parses an HTTP-date Retry-After header relative to now', () => {
    const header = new Date(Date.now() + 10000).toUTCString();
    const delay = calculateBackoffDelay({
      attempt: 1,
      baseDelayMs: 1000,
      maxBackoffMs: 60000,
      retryAfterHeader: header,
    });
    expect(delay).toBeGreaterThanOrEqual(9000);
    expect(delay).toBeLessThanOrEqual(10500);
  });

  it('caps exponential backoff at maxBackoffMs for large attempt numbers', () => {
    for (let i = 0; i < 50; i += 1) {
      const delay = calculateBackoffDelay({ attempt: 10, baseDelayMs: 1000, maxBackoffMs: 60000 });
      expect(delay).toBeLessThanOrEqual(60000);
    }
  });

  it('caps a valid Retry-After header at maxBackoffMs', () => {
    const delay = calculateBackoffDelay({
      attempt: 1,
      baseDelayMs: 1000,
      maxBackoffMs: 60000,
      retryAfterHeader: '120',
    });
    expect(delay).toBe(60000);
  });

  it('falls back to exponential backoff when Retry-After is not parseable', () => {
    for (let i = 0; i < 50; i += 1) {
      const delay = calculateBackoffDelay({
        attempt: 3,
        baseDelayMs: 1000,
        maxBackoffMs: 60000,
        retryAfterHeader: 'not-a-valid-value',
      });
      expect(delay).toBeGreaterThanOrEqual(3000);
      expect(delay).toBeLessThanOrEqual(5000);
    }
  });

  it('falls back to exponential backoff when Retry-After resolves to a non-positive delay', () => {
    const pastHeader = new Date(Date.now() - 10000).toUTCString();
    for (let i = 0; i < 50; i += 1) {
      const delay = calculateBackoffDelay({
        attempt: 3,
        baseDelayMs: 1000,
        maxBackoffMs: 60000,
        retryAfterHeader: pastHeader,
      });
      expect(delay).toBeGreaterThanOrEqual(3000);
      expect(delay).toBeLessThanOrEqual(5000);
    }
  });
});
