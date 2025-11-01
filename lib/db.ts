import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

// DigitalOcean managed PostgreSQL uses self-signed certificates
// Set NODE_TLS_REJECT_UNAUTHORIZED=0 in environment to allow connections
// Always use SSL for DigitalOcean Postgres (connection string includes sslmode=require)
export const pool = new Pool({
  connectionString,
  max: 10,
  ssl: connectionString?.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

export async function healthcheck() {
  const r = await pool.query('select 1 as ok');
  return r.rows[0].ok === 1;
}