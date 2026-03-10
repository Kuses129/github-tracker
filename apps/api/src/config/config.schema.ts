import { z } from 'zod';

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  CORRELATION_ID_HEADER: z.string().default('x-correlation-id'),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),
  GITHUB_APP_ID: z.coerce.number().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),
  GITHUB_APP_INSTALLATION_ID: z.coerce.number().optional(),
});

export type AppConfig = z.infer<typeof configSchema>;
