import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db';

async function main() {
  try {
    await db.query(fs.readFileSync(path.resolve(process.cwd(), 'sql/schema.sql'), 'utf8'));
    console.log('Postgres tables and pgvector are ready.');
  } catch (error: any) {
    if (String(error?.message || error).toLowerCase().includes('vector')) {
      throw new Error(`pgvector is required for semantic recommendations. Enable the vector extension in this Postgres database, then rerun db:setup. Original error: ${error.message}`);
    }
    throw error;
  }
}
main().finally(() => db.end());
