import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards the handoff sample files against accidental edits. The checksums come from
// docs/SAMPLE-DATA.md; `npm run samples:check` proves the generator still reproduces them.
// The importer-level test (exact totals 56.690860 / 10.000000 tUSDC) is added in Phase 09.
const ROOT = join(import.meta.dirname, '..', '..');

function documentedChecksums(): Map<string, string> {
  const doc = readFileSync(join(ROOT, 'docs', 'SAMPLE-DATA.md'), 'utf8');
  const rows = [...doc.matchAll(/^\| `([^`]+)` \| `([0-9a-f]{64})` \|$/gm)];
  return new Map(rows.map((m) => [m[1] as string, m[2] as string]));
}

describe('sample payroll files', () => {
  const expected = documentedChecksums();

  it('documents exactly four checksums', () => {
    expect([...expected.keys()].sort()).toEqual([
      'gajian-payroll-sample-1000.csv',
      'gajian-payroll-sample-1000.txt',
      'gajian-payroll-template-blank.csv',
      'gajian-payroll-uniform-1000.csv',
    ]);
  });

  it.each([...documentedChecksums().entries()])('%s matches its documented SHA-256', (file, sha) => {
    const bytes = readFileSync(join(ROOT, 'public', 'templates', file));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha);
  });

  it('blank template has exactly the canonical header row', () => {
    const blank = readFileSync(join(ROOT, 'public', 'templates', 'gajian-payroll-template-blank.csv'), 'utf8');
    expect(blank).toBe('near_account_id,receiver_name,currency,amount,mobile_phone,email\r\n');
  });
});
