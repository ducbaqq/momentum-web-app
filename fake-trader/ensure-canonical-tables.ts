// Script to ensure all canonical tables exist
import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/momentum_collector',
  ssl: process.env.DATABASE_URL?.includes('ondigitalocean') ? { rejectUnauthorized: false } : false,
});

async function ensureCanonicalTables() {
  try {
    console.log('🔍 Checking for canonical tables...');
    
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
    
    console.log('\n📊 Canonical tables status:');
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
      console.log('\n✅ All canonical tables are present!');
    } else {
      console.log('\n⚠️  Some tables are missing. Please check the SQL execution above.');
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

