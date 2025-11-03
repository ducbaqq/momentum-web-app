#!/usr/bin/env tsx
/**
 * Ensure canonical tables exist in the trading database
 * Usage: tsx ensure-canonical-tables.ts
 * 
 * This script uses the same database configuration as the fake trader:
 * - DB_BASE_URL + TRADING_DB_NAME (recommended)
 * - TRADING_DB_URL (fallback)
 * - DATABASE_URL + TRADING_DB_NAME (fallback)
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
 */
function getTradingDbUrl(): string {
  // PRIMARY: Use DB_BASE_URL + TRADING_DB_NAME (recommended)
  if (process.env.DB_BASE_URL) {
    const baseUrl = process.env.DB_BASE_URL;
    const tradingDbName = process.env.TRADING_DB_NAME || process.env.NODE_ENV || 'dev';
    return `${baseUrl}/${tradingDbName}`;
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
  console.error('  TRADING_DB_NAME="dev"  # or staging');
  console.error('\n📌 FALLBACK options:');
  console.error('  - TRADING_DB_URL (full connection string)');
  console.error('  - DATABASE_URL + TRADING_DB_NAME (derives from DATABASE_URL)');
  process.exit(1);
}

const tradingDbUrl = getTradingDbUrl();
const dbName = tradingDbUrl.split('/').pop()?.split('?')[0] || 'dev';

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

const pool = new Pool({
  connectionString,
  ssl: sslConfig,
});

async function ensureCanonicalTables() {
  try {
    console.log(`🔍 Connecting to ${dbName} database...`);
    console.log(`   URL: ${tradingDbUrl.split('@')[1] || 'local'}`);
    
    // Test connection
    await pool.query('SELECT 1');
    console.log(`✅ Connected to ${dbName} database`);
    
    console.log('\n🔍 Checking for canonical tables...');
    
    // Read and execute canonical tables SQL
    const canonicalTablesSQL = fs.readFileSync(
      path.join(__dirname, 'create-canonical-tables.sql'),
      'utf-8'
    );
    
    console.log('📝 Creating canonical tables...');
    await pool.query(canonicalTablesSQL);
    console.log('✅ Canonical tables created/verified');
    
    // Read and execute events table SQL
    const eventsTableSQL = fs.readFileSync(
      path.join(__dirname, 'create-events-table.sql'),
      'utf-8'
    );
    
    console.log('📝 Creating events table...');
    await pool.query(eventsTableSQL);
    console.log('✅ Events table created/verified');
    
    // Verify tables exist
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN (
        'ft_account_snapshots',
        'ft_positions_v2',
        'ft_orders',
        'ft_fills',
        'ft_price_snapshots',
        'ft_events'
      )
      ORDER BY table_name
    `;
    
    const result = await pool.query(tablesQuery);
    const existingTables = result.rows.map(row => row.table_name);
    
    console.log(`\n📊 ${dbName} database canonical tables status:`);
    const requiredTables = [
      'ft_account_snapshots',
      'ft_positions_v2',
      'ft_orders',
      'ft_fills',
      'ft_price_snapshots',
      'ft_events'
    ];
    
    for (const table of requiredTables) {
      const exists = existingTables.includes(table);
      console.log(`  ${exists ? '✅' : '❌'} ${table}`);
    }
    
    if (existingTables.length === requiredTables.length) {
      console.log(`\n✅ All canonical tables are present in ${dbName} database!`);
    } else {
      console.log('\n⚠️  Some tables are missing. Please check the SQL execution above.');
      process.exit(1);
    }
    
  } catch (error: any) {
    console.error('❌ Error ensuring canonical tables:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

ensureCanonicalTables();
