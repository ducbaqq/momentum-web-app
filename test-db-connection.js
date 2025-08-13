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

console.log('🔍 Debugging database connection...');
console.log('DATABASE_URL found:', env.DATABASE_URL ? 'Yes' : 'No');

if (env.DATABASE_URL) {
  console.log('DATABASE_URL length:', env.DATABASE_URL.length);
  console.log('DATABASE_URL starts with:', env.DATABASE_URL.substring(0, 50) + '...');
  
  // Parse the connection string to check components
  try {
    const url = new URL(env.DATABASE_URL);
    console.log('Parsed URL components:');
    console.log('  Protocol:', url.protocol);
    console.log('  Hostname:', url.hostname);
    console.log('  Port:', url.port);
    console.log('  Database:', url.pathname);
    console.log('  Username:', url.username);
    console.log('  Password:', url.password ? '[HIDDEN]' : 'None');
  } catch (e) {
    console.error('❌ Failed to parse DATABASE_URL as URL:', e.message);
  }
}

if (!env.DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in .env file.');
  process.exit(1);
}

async function testConnection() {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔌 Testing database connection...');
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('✅ Database connection successful!');
    console.log('Current time from DB:', result.rows[0].current_time);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('Full error:', error);
  } finally {
    await pool.end();
  }
}

testConnection();