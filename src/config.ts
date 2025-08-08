// config.ts - Configuration for web app service
import 'dotenv/config';

/* =========================
   Types
   ========================= */
export interface WebAppConfig {
  server: {
    port: number;
    host: string;
  };
  database: {
    url: string;
    poolSize: number;
  };
  collector: {
    apiUrl: string;
  };
  symbols: string[];
}

/* =========================
   Config Validation
   ========================= */
const env = (k: string, d: string | undefined = undefined): string | undefined => 
  (process.env[k] ?? d);

// Helper to validate and parse numbers
function parseEnvNumber(key: string, defaultValue: number, min = -Infinity, max = Infinity): number {
  const raw = env(key, defaultValue.toString());
  const num = Number(raw);
  if (isNaN(num)) {
    console.error(`❌ Invalid ${key}="${raw}" - must be a number. Using default: ${defaultValue}`);
    return defaultValue;
  }
  if (num < min || num > max) {
    console.error(`❌ Invalid ${key}="${num}" - must be between ${min} and ${max}. Using default: ${defaultValue}`);
    return defaultValue;
  }
  return num;
}

/* =========================
   Exported Configuration
   ========================= */
export const config: WebAppConfig = {
  server: {
    port: parseEnvNumber('WEB_PORT', 3000, 1000, 65535),
    host: env('WEB_HOST', '0.0.0.0') || '0.0.0.0',
  },
  
  database: {
    url: process.env.DATABASE_URL || '',
    poolSize: parseEnvNumber('DB_POOL_SIZE', 5, 1, 20), // Smaller pool for web app
  },
  
  collector: {
    apiUrl: env('COLLECTOR_API_URL', 'http://localhost:8080') || 'http://localhost:8080',
  },
  
  symbols: (env('SYMBOLS', 'BTCUSDT,ETHUSDT,SOLUSDT,XRPUSDT') || '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean),
};

// Validation
export function validateConfig(): string[] {
  const errors: string[] = [];
  
  if (!config.database.url) {
    errors.push('DATABASE_URL is required for web app');
  }
  
  if (config.symbols.length === 0) {
    errors.push('At least one symbol must be specified in SYMBOLS');
  }
  
  return errors;
}

// Utility functions
export const ts = (): string => new Date().toISOString();
export const log = (...args: unknown[]): void => console.log(`${ts()}`, ...args);
