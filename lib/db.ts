import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

// Neon recommends SSL; pgBouncer pooler host is great for serverless-style traffic
export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

export async function healthcheck() {
  const r = await pool.query('select 1 as ok');
  return r.rows[0].ok === 1;
}