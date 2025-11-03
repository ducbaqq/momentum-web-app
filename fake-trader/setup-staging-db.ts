#!/usr/bin/env tsx
/**
 * Setup trading database schema for fake trader
 * This script creates all required tables in the trading database
 * Usage: tsx setup-staging-db.ts
 * 
 * Configuration options:
 * 1. DB_BASE_URL + TRADING_DB_NAME (recommended)
 *    - DB_BASE_URL: Base connection string (everything before database name)
 *    - TRADING_DB_NAME: Database name (e.g., "dev", "staging")
 * 
 * 2. TRADING_DB_URL (full connection string)
 * 
 * 3. DATABASE_URL + TRADING_DB_NAME (derives from DATABASE_URL)
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

/**
 * Replace database name in connection string
 */
function replaceDbName(connectionString: string, newDbName: string): string {
  return connectionString.replace(/\/([^/?]+)(\?|$)/, `/${newDbName}$2`);
}

/**
 * Get trading database URL from environment variables
 * PRIMARY: DB_BASE_URL + TRADING_DB_NAME
 * Falls back to other patterns for backward compatibility
 */
function getTradingDbUrl(): string {
  // PRIMARY: Use DB_BASE_URL + TRADING_DB_NAME (recommended)
  if (process.env.DB_BASE_URL) {
    const tradingDbName = process.env.TRADING_DB_NAME || process.env.NODE_ENV || 'dev';
    return `${process.env.DB_BASE_URL}/${tradingDbName}`;
  }
  
  // FALLBACK 1: Use explicit TRADING_DB_URL
  if (process.env.TRADING_DB_URL) {
    return process.env.TRADING_DB_URL;
  }
  
  // FALLBACK 2: Derive from DATABASE_URL
  if (process.env.DATABASE_URL) {
    const tradingDbName = process.env.TRADING_DB_NAME || process.env.NODE_ENV || 'dev';
    return replaceDbName(process.env.DATABASE_URL, tradingDbName);
  }
  
  console.error('❌ Error: No database configuration found');
  console.error('\n📝 Please set one of the following:');
  console.error('\n✅ PRIMARY (recommended):');
  console.error('  DB_BASE_URL="postgresql://user:pass@host:port"');
  console.error('  TRADING_DB_NAME="dev"  # or "staging", "prod", etc.');
  console.error('\n📌 FALLBACK options:');
  console.error('  - TRADING_DB_URL (full connection string)');
  console.error('  - DATABASE_URL + TRADING_DB_NAME (derives from DATABASE_URL)');
  process.exit(1);
}

const tradingDbUrl = getTradingDbUrl();

// Parse connection string and handle SSL properly
let connectionString = tradingDbUrl;
// Remove sslmode if present - we'll handle SSL via Pool config instead
connectionString = connectionString.replace(/[?&]sslmode=[^&]*/g, '');

// Support SSL certificate file if provided via env var
const sslCertPath = process.env.TRADING_SSL_CERT_PATH;
let sslConfig: any = false;

if (sslCertPath && fs.existsSync(sslCertPath)) {
  // Use provided certificate
  sslConfig = {
    ca: fs.readFileSync(sslCertPath).toString(),
    rejectUnauthorized: true
  };
  console.log(`📜 Using SSL certificate from: ${sslCertPath}`);
} else {
  // Disable certificate verification for self-signed certificates
  const isDigitalOcean = connectionString.includes('ondigitalocean');
  sslConfig = isDigitalOcean ? { rejectUnauthorized: false } : false;
  if (isDigitalOcean) {
    console.log('⚠️  SSL certificate verification disabled (self-signed certificate)');
  }
}

const tradingPool = new Pool({
  connectionString,
  ssl: sslConfig,
});

async function setupTradingDatabase() {
  try {
    console.log('🔍 Connecting to trading database...');
    
    // Test connection
    await tradingPool.query('SELECT 1');
    console.log('✅ Connected to trading database');
    
    // Read and execute fake trader tables SQL
    const fakeTraderTablesSQL = fs.readFileSync(
      path.join(__dirname, 'create-fake-trader-tables.sql'),
      'utf-8'
    );
    
    console.log('\n📝 Creating fake trader tables...');
    await tradingPool.query(fakeTraderTablesSQL);
    console.log('✅ Fake trader tables created/verified');
    
    // Verify tables exist
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'ft_runs',
        'ft_results',
        'ft_trades',
        'ft_equity',
        'ft_positions',
        'ft_signals'
      )
      ORDER BY table_name
    `;
    
    const result = await tradingPool.query(tablesQuery);
    const existingTables = result.rows.map(row => row.table_name);
    
    console.log('\n📊 Trading database tables status:');
    const requiredTables = [
      'ft_runs',
      'ft_results',
      'ft_trades',
      'ft_equity',
      'ft_positions',
      'ft_signals'
    ];
    
    for (const table of requiredTables) {
      const exists = existingTables.includes(table);
      console.log(`  ${exists ? '✅' : '❌'} ${table}`);
    }
    
    if (existingTables.length === requiredTables.length) {
      console.log('\n✅ All fake trader tables are present in trading database!');
      console.log('\n📝 Note: The fake trader will:');
      console.log('  - Read OHLCV/features data from: momentum_collector (from DATABASE_URL or DB_BASE_URL)');
      console.log(`  - Write fake trader data to: ${tradingDbUrl.split('@')[1]?.split('/')[0] || 'trading DB'} → ${tradingDbUrl.split('/').pop()?.split('?')[0] || 'unknown'}`);
    } else {
      console.log('\n⚠️  Some tables are missing. Please check the SQL execution above.');
      process.exit(1);
    }
    
  } catch (error: any) {
    console.error('❌ Error setting up trading database:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await tradingPool.end();
  }
}

setupTradingDatabase();

