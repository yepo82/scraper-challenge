import { describe, expect, it } from 'vitest';
import { logger } from '../../src/utils/logger.js';

describe('logger', () => {
  it('exposes the standard pino logging methods', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('is configured with the log level from env', async () => {
    const { env } = await import('../../src/config.js');
    expect(logger.level).toBe(env.LOG_LEVEL);
  });
});
