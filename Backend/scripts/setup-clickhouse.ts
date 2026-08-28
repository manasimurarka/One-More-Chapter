import fs from 'node:fs';
import path from 'node:path';
import { clickhouse, closeClickhouse } from '../src/clickhouse';

async function main() {
  const client = clickhouse();
  try {
    await client.command({ query: fs.readFileSync(path.resolve(process.cwd(), 'analytics/schema.sql'), 'utf8'), clickhouse_settings: { wait_end_of_query: 1 } });
    const result = await client.query({ query: "SELECT count() AS count FROM system.tables WHERE database = currentDatabase() AND name = 'reading_events'", format: 'JSONEachRow' });
    if (Number((await result.json<{ count: string | number }>())[0]?.count) !== 1) throw new Error('reading_events table was not created');
    console.log('ClickHouse reading_events table is ready.');
  } finally { await closeClickhouse(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
