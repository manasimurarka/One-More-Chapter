import { db, query } from '../src/db';

async function main() {
  const force = process.argv.includes('--force');
  const rows = await query<{ id: string }>(`UPDATE catalog_import_runs
    SET status='FAILED', completed_at=now(), details=details || $1::jsonb
    WHERE status='RUNNING' ${force ? '' : "AND started_at < now() - interval '30 minutes'"}
    RETURNING id`, [JSON.stringify({ error: force ? 'Force-marked failed after terminal-runner interruption' : 'Marked failed after interrupted importer process' })]);
  const active = await query<{ count: number }>("SELECT count(*)::int AS count FROM catalog_import_runs WHERE status='RUNNING'");
  console.log(JSON.stringify({ markedFailed: rows.length, activeRuns: active[0].count, force }));
}

main().finally(() => db.end());
