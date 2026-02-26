import * as winston from 'winston';

const { combine, timestamp, json, colorize, simple } = winston.format;

export function buildWinstonTransports(nodeEnv: string): winston.transport[] {
  if (nodeEnv === 'test') {
    return [new winston.transports.Console({ silent: true })];
  }

  if (nodeEnv === 'production') {
    return [
      new winston.transports.Console({
        format: combine(timestamp(), json()),
      }),
    ];
  }

  return [
    new winston.transports.Console({
      format: combine(colorize(), timestamp(), simple()),
    }),
  ];
}
