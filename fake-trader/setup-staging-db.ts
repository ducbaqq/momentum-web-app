#!/usr/bin/env tsx
/**
 * Setup trading database schema for fake trader
 * This script creates all required tables in the trading database
 * Usage: tsx setup-staging-db.ts
 * 
 * Note: Set TRADING_DB_URL environment variable to point to your trading database
 * (e.g., fake-trader-dev, fake-trader-staging, etc.)
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

if (!process.env.TRADING_DB_URL) {
  console.error('❌ Error: TRADING_DB_URL environment variable is required');
  console.error('Please add TRADING_DB_URL to your .env file');
  console.error('Example: TRADING_DB_URL="postgresql://user:pass@host:port/fake-trader-staging"');
  process.exit(1);
}

// Parse connection string and handle SSL properly
let connectionString = process.env.TRADING_DB_URL!;
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
  sslConfig = { rejectUnauthorized: false };
  console.log('⚠️  SSL certificate verification disabled (self-signed certificate)');
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
      console.log('  - Read OHLCV/features data from: momentum_collector (DATABASE_URL)');
      console.log(`  - Write fake trader data to: trading database (TRADING_DB_URL)`);
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

