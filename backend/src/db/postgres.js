import pg from 'pg';
import { config } from '../config/index.js';

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: config.database.url,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }
  return pool;
}

export async function query(text, params) {
  const pool = getPool();
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 100) {
      console.log('Slow query:', { text, duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    console.error('Database query error:', { text, error: error.message });
    throw error;
  }
}

export async function getClient() {
  const pool = getPool();
  return pool.connect();
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function healthCheck() {
  try {
    await query('SELECT 1');
    return true;
  } catch (error) {
    return false;
  }
}
