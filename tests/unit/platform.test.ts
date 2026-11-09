import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';
import { healthReport } from '@/server/health';

// Phase 01 platform checks: the native SQLite driver loads on this Node version, Drizzle
// can talk to it, and BigInt base-unit math is exact at the PRD's large-number example.
describe('platform', () => {
  it('opens SQLite through Drizzle with WAL-capable better-sqlite3', () => {
    const client = new Database(':memory:');
    const db = drizzle({ client });
    const row = db.get<{ answer: number; version: string }>(sql`select 42 as answer, sqlite_version() as version`);
    expect(row.answer).toBe(42);
    expect(row.version).toMatch(/^3\.\d+\.\d+$/);
    client.close();
  });

  it('keeps 1,000 x 1,000,000 exact in 6-decimal base units', () => {
    const perRow = 1_000_000n * 10n ** 6n;
    const total = Array.from({ length: 1000 }, () => perRow).reduce((a, b) => a + b, 0n);
    expect(total).toBe(1_000_000_000n * 10n ** 6n);
  });

  it('reports testnet in the health payload', () => {
    expect(healthReport(new Date('2026-11-09T00:00:00Z'))).toEqual({
      status: 'ok',
      service: 'gajian',
      network: 'testnet',
      time: '2026-11-09T00:00:00.000Z',
    });
  });
});
