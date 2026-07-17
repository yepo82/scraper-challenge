import Bottleneck from 'bottleneck';

export function createRateLimiter(minTimeMs: number, maxConcurrent = 1): Bottleneck {
  return new Bottleneck({ maxConcurrent, minTime: minTimeMs });
}
