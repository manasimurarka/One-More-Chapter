import { db, query } from '../src/db';

query<{ version: string }>('SELECT version()')
  .then(([row]) => console.log(`Connected: ${row.version.split(',')[0]}`))
  .finally(() => db.end());
