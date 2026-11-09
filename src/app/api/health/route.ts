import { healthReport } from '@/server/health';

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json(healthReport(), { headers: { 'Cache-Control': 'no-store' } });
}
