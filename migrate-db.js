const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Simple .env parser
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found. Please create it with your DATABASE_URL.');
    process.exit(1);
  }
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envVars = {};
  
  envContent.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#') && trimmedLine.includes('=')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      envVars[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, ''); // Remove quotes
    }
  });
  
  return envVars;
}

const env = loadEnv();

if (!env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in .env file.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  try {
    console.log('Adding error column to bt_runs table...');
    
    await pool.query('ALTER TABLE bt_runs ADD COLUMN IF NOT EXISTS error TEXT');
    
    console.log('✅ Migration completed successfully!');
    
    // Verify the column exists
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'bt_runs' AND column_name = 'error'
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Error column verified:', result.rows[0]);
    } else {
      console.log('❌ Error column not found after migration');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    await pool.end();
  }
}

migrate();