import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  DRIVER_JWT_REFRESH_TTL: z.string().default('180d'),

  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  TZ_DISPLAY: z.string().default('Asia/Kolkata'),

  REDIS_URL: z.string().default('redis://localhost:6379'),

  R2_ENDPOINT: z.string().optional().default(''),
  R2_ACCESS_KEY_ID: z.string().optional().default(''),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(''),
  R2_BUCKET: z.string().default('ucr-erp-documents'),
  R2_PRESIGN_EXPIRY_SECONDS: z.coerce.number().int().positive().max(600).default(600),

  COMPANY_LEGAL_NAME: z.string().default('Ulagammal Car Rental'),
  COMPANY_GSTIN: z.string().optional().default(''),
  COMPANY_STATE_CODE: z.string().default('27'),
  FINANCIAL_YEAR_START_MONTH: z.coerce.number().int().min(1).max(12).default(4),

  EXPO_ACCESS_TOKEN: z.string().optional().default(''),
  RESEND_API_KEY: z.string().optional().default(''),
  SENTRY_DSN: z.string().optional().default(''),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
