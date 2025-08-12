import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
});

async function setupTables() {
  try {
    console.log('Setting up backtest tables...');
    
    const sql = fs.readFileSync('setup-db.sql', 'utf8');
    await pool.query(sql);
    
    console.log('✅ Backtest tables created successfully!');
  } catch (error) {
    console.error('❌ Error setting up tables:', error);
  } finally {
    await pool.end();
  }
}

setupTables();