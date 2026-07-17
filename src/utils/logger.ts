import pino from 'pino';
import { appConfig } from '../config.js';

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: appConfig.logLevel,
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true },
      },
});
