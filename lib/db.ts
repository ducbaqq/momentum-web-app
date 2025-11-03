import { Pool } from 'pg';

/**
 * Extract database name from connection string
 * e.g., "postgresql://user:pass@host:port/dbname" -> "dbname"
 */
function extractDbName(connectionString: string): string {
  const match = connectionString.match(/\/([^/?]+)(\?|$)/);
  return match ? match[1] : '';
}

/**
 * Replace database name in connection string
 * e.g., "postgresql://user:pass@host:port/dbname" -> "postgresql://user:pass@host:port/newdbname"
 */
function replaceDbName(connectionString: string, newDbName: string): string {
  return connectionString.replace(/\/([^/?]+)(\?|$)/, `/${newDbName}$2`);
}

/**
 * Construct database URLs from base connection string
 * Primary method: DB_BASE_URL + TRADING_DB_NAME
 * Falls back to other patterns for backward compatibility
 */
function getDatabaseUrls(): { dataUrl: string; tradingUrl: string } {
  // PRIMARY: Use DB_BASE_URL + TRADING_DB_NAME (recommended)
  if (process.env.DB_BASE_URL) {
    const baseUrl = process.env.DB_BASE_URL;
    const tradingDbName = process.env.TRADING_DB_NAME || process.env.NODE_ENV || 'dev';
    
    const dataUrl = `${baseUrl}/momentum_collector`;
    const tradingUrl = `${baseUrl}/${tradingDbName}`;
    
    return { dataUrl, tradingUrl };
  }
  
  // FALLBACK 1: Use DATABASE_URL and derive trading DB by replacing database name
  if (process.env.DATABASE_URL) {
    const dataUrl = process.env.DATABASE_URL;
    
    // If TRADING_DB_URL is explicitly set, use it
    if (process.env.TRADING_DB_URL) {
      return { dataUrl, tradingUrl: process.env.TRADING_DB_URL };
    }
    
    // Otherwise, derive trading DB URL from DATABASE_URL by replacing database name
    const tradingDbName = process.env.TRADING_DB_NAME || process.env.NODE_ENV || 'dev';
    const tradingUrl = replaceDbName(dataUrl, tradingDbName);
    
    return { dataUrl, tradingUrl };
  }
  
  // FALLBACK 2: Default to localhost
  return {
    dataUrl: 'postgresql://localhost/momentum_collector',
    tradingUrl: 'postgresql://localhost/fake-trader'
  };
}

function createPool(connectionString: string | undefined, defaultUrl: string): Pool {
  const url = connectionString || defaultUrl;
  const isDigitalOcean = url.includes('ondigitalocean') || url.includes('ssl') || url.includes('sslmode=require');
  
  return new Pool({
    connectionString: url,
    ssl: isDigitalOcean ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
}

// Get database URLs based on environment configuration
const { dataUrl, tradingUrl } = getDatabaseUrls();

// Data pool: Always uses momentum_collector database (for OHLCV/features/market data)
export const dataPool = createPool(dataUrl, 'postgresql://localhost/momentum_collector');

// Trading pool: Uses separate database (dev/staging) based on TRADING_DB_NAME or NODE_ENV
// Used for fake trader tables (ft_*)
export const tradingPool = createPool(tradingUrl, 'postgresql://localhost/fake-trader');

// Legacy export for backward compatibility (uses data pool - most routes need market data)
export const pool = dataPool;

// Log which databases are being used (only in server-side, not during build)
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'production') {
  console.log('📊 Web App Database configuration:');
  console.log(`  📖 Data pool (OHLCV/features): ${dataUrl.split('@')[1]?.split('/')[0] || 'local'} → momentum_collector`);
  console.log(`  ✍️  Trading pool (fake trader): ${tradingUrl.split('@')[1]?.split('/')[0] || 'local'} → ${extractDbName(tradingUrl)}`);
  
  if (process.env.DB_BASE_URL) {
    console.log(`  ✅ Using DB_BASE_URL pattern (recommended)`);
    console.log(`  📝 TRADING_DB_NAME: ${process.env.TRADING_DB_NAME || process.env.NODE_ENV || 'dev'}`);
  }
}

export async function healthcheck() {
  const r = await dataPool.query('select 1 as ok');
  return r.rows[0].ok === 1;
}