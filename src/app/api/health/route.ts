import { getDatabase } from '@/server/db/client';
import { healthReport } from '@/server/health';
import { hostedMode } from '@/server/hosted';

export const dynamic = 'force-dynamic';

/** Liveness + database readiness (Railway deploy health check). 503 if the database cannot be read. */
export function GET(): Response {
  let db: 'ok' | 'error' = 'ok';
  try {
    getDatabase().sqlite.prepare('select 1').get();
  } catch {
    db = 'error';
  }
  const mode = hostedMode();
  return Response.json({ ...healthReport(), db, hostedDemo: mode.demo, readOnly: mode.readOnly }, { status: db === 'ok' ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
