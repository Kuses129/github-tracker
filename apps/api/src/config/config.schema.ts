import { z } from 'zod';

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url().optional(),
  CORRELATION_ID_HEADER: z.string().default('x-correlation-id'),
});

export type AppConfig = z.infer<typeof configSchema>;
