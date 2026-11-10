import { getDatabase } from '@/server/db/client';
import { healthReport } from '@/server/health';
import { hostedMode } from '@/server/hosted';
import { faceModelsPresent } from '@/server/identity/face';

export const dynamic = 'force-dynamic';

/**
 * Liveness + database readiness (Railway deploy health check). 503 if the database cannot be read.
 * faceModels: the identity check's model files are present (informational; never 503).
 */
export function GET(): Response {
  let db: 'ok' | 'error' = 'ok';
  try {
    getDatabase().sqlite.prepare('select 1').get();
  } catch {
    db = 'error';
  }
  const mode = hostedMode();
  return Response.json({ ...healthReport(), db, hostedDemo: mode.demo, readOnly: mode.readOnly, faceModels: faceModelsPresent() }, { status: db === 'ok' ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
