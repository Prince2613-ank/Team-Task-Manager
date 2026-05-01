import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectionString = process.env.DATABASE_URL;
const isDevCommand = process.env.npm_lifecycle_event === 'dev';
const isProduction = process.env.NODE_ENV === 'production' && !isDevCommand;

if (!connectionString && isProduction) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env and set your PostgreSQL connection string.');
}

const useSsl = process.env.DATABASE_SSL === 'true';
const databaseHost = getDatabaseHost(connectionString);
const useEmbeddedDb = !isProduction && (
  process.env.USE_EMBEDDED_DB === 'true' ||
  !connectionString ||
  isPrivateManagedHost(databaseHost)
);

export const pool = useEmbeddedDb
  ? await createEmbeddedPool()
  : new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false
  });

function getDatabaseHost(url) {
  if (!url) {
    return '';
  }

  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function isPrivateManagedHost(hostname) {
  return hostname === 'postgres.railway.internal' ||
    hostname.endsWith('.railway.internal') ||
    hostname.endsWith('.internal') ||
    /^dpg-[a-z0-9-]+-a$/i.test(hostname);
}

async function createEmbeddedPool() {
  const { PGlite } = await import('@electric-sql/pglite');
  const dataDir = process.env.PGLITE_DATA_DIR || path.join(process.cwd(), '.data', 'pglite');
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });

  const client = new PGlite(dataDir);

  console.warn(`Using embedded local database at ${dataDir}. Set DATABASE_URL to a reachable PostgreSQL URL for shared data.`);

  return {
    exec(text) {
      return client.exec(text);
    },
    query(text, params = []) {
      return client.query(text, params);
    },
    async connect() {
      return {
        query(text, params = []) {
          return client.query(text, params);
        },
        release() {}
      };
    },
    end() {
      return client.close();
    }
  };
}

export async function initDb() {
  const schemaPath = path.join(__dirname, '..', 'sql', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  if (typeof pool.exec === 'function') {
    await pool.exec(schema);
    return;
  }

  await pool.query(schema);
}

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function transaction(callback) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
