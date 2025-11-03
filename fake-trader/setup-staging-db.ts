#!/usr/bin/env tsx
/**
 * Setup staging database schema for fake trader
 * This script creates all required tables in the staging database
 * Usage: tsx setup-staging-db.ts
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

if (!process.env.STAGING_DATABASE_URL) {
  console.error('❌ Error: STAGING_DATABASE_URL environment variable is required');
  console.error('Please add STAGING_DATABASE_URL to your .env file');
  process.exit(1);
}

const stagingPool = new Pool({
  connectionString: process.env.STAGING_DATABASE_URL,
  ssl: process.env.STAGING_DATABASE_URL?.includes('ondigitalocean') ? { rejectUnauthorized: false } : false,
});

async function setupStagingDatabase() {
  try {
    console.log('🔍 Connecting to staging database...');
    
    // Test connection
    await stagingPool.query('SELECT 1');
    console.log('✅ Connected to staging database');
    
    // Read and execute fake trader tables SQL
    const fakeTraderTablesSQL = fs.readFileSync(
      path.join(__dirname, 'create-fake-trader-tables.sql'),
      'utf-8'
    );
    
    console.log('\n📝 Creating fake trader tables...');
    await stagingPool.query(fakeTraderTablesSQL);
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
    
    const result = await stagingPool.query(tablesQuery);
    const existingTables = result.rows.map(row => row.table_name);
    
    console.log('\n📊 Staging database tables status:');
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
      console.log('\n✅ All fake trader tables are present in staging database!');
      console.log('\n📝 Note: The fake trader will:');
      console.log('  - Read OHLCV/features data from: momentum_collector (DATABASE_URL)');
      console.log('  - Write fake trader data to: fake-trader-staging (STAGING_DATABASE_URL)');
    } else {
      console.log('\n⚠️  Some tables are missing. Please check the SQL execution above.');
      process.exit(1);
    }
    
  } catch (error: any) {
    console.error('❌ Error setting up staging database:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await stagingPool.end();
  }
}

setupStagingDatabase();

