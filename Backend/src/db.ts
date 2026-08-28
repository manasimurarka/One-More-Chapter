import 'dotenv/config';
import { Pool, type QueryResultRow } from 'pg';

function requiredEnv(key: string) {
  const value = process.env[key]?.trim();
  if (!value || value.includes('REPLACE')) throw new Error(`${key} is not configured`);
  return value;
}

function postgresConnectionString() {
  const connection = new URL(requiredEnv('DATABASE_URL'));
  for (const key of ['sslmode', 'sslcert', 'sslrootcert']) connection.searchParams.delete(key);
  return connection.toString();
}

const postgresCa = requiredEnv('POSTGRES_CA_CERT').replace(/\\n/g, '\n');

export const db = new Pool({
  connectionString: postgresConnectionString(),
  ssl: { ca: postgresCa, rejectUnauthorized: true },
});

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return (await db.query<T>(text, values)).rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  const row = (await query<T>(text, values))[0];
  if (!row) throw new Error('Not found');
  return row;
}
