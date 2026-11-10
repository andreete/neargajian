/**
 * Phase 21 · identity check end to end with the REAL face engine (YuNet + SFace on ONNX Runtime,
 * models from `npm run vision:models`) and the labelled test stub KTP reader on the committed
 * synthetic specimens: verified / impostor / duplicate NIK / not a KTP / bad image, the face is
 * blurred before the reader sees the card, manual review, the public-demo dry run, the
 * append-only log, rate limit, engines off, and the submit gate.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDatabase, type DatabaseHandle } from '@/server/db/client';
import { seedDemo } from '@/server/db/seed';
import { loadConfig } from '@/server/config';
import { identityChecks, recipients } from '@/server/db/schema';
import { createFaceEngine, faceModelsPresent, type FaceEngine } from '@/server/identity/face';
import { stubKtpReader, type KtpReader } from '@/server/identity/ktp-reader';
import {
  CHECKS_PER_ADMIN_PER_HOUR, IdentityLimitError, identitySubmitProblem, identityVerifiedOnly, reviewIdentity,
  runIdentityCheck, runSpecimenCheck, setIdentityVerifiedOnly, type IdentityDeps,
} from '@/server/identity/service';
import { uploadToDraft } from '@/server/runs/draft-service';
import { createRun } from '@/server/runs/repository';
import { submitRun } from '@/server/runs/lifecycle';
import { FakeVault } from '../helpers/fake-vault';

const dir = mkdtempSync(join(tmpdir(), 'sentfund-id-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const admin = { id: 'usr_admin', role: 'admin' as const };
const maker = { id: 'usr_maker', role: 'maker' as const };
const NOW = new Date('2026-11-10T06:00:00Z');
const spec = (f: string) => readFileSync(join('public', 'specimens', f));
const SECRET = loadConfig().sessionSecret; // the seed hashes NIKs with the same key

if (!faceModelsPresent()) throw new Error('Face models missing: run `npm run vision:models` before the tests.');
let engine: FaceEngine;
let deps: IdentityDeps;
let h: DatabaseHandle;
let k = 0;
const id = (account: string) => h.db.select().from(recipients).where(eq(recipients.nearAccountId, account)).get()!;
const EMMA = 'recipient1.sentfund-payroll.testnet', DANIEL = 'recipient2.sentfund-payroll.testnet', GRACE = 'recipient3.sentfund-payroll.testnet';

beforeAll(() => { engine = createFaceEngine(); });
beforeEach(async () => {
  k += 1;
  h = openDatabase(join(dir, `i${k}.sqlite`));
  await seedDemo(h.db, { env: { DEMO_MODE: 'true' }, now: NOW, recipientDirectory: true, testnetHistory: false });
  deps = { face: engine, reader: stubKtpReader(), secret: SECRET };
});
afterEach(() => { delete process.env.HOSTED_DEMO; });

describe('seed', () => {
  it('starts with the three testnet recipients verified (labelled demo seed) and the setting on; sample employees not checked', () => {
    expect(identityVerifiedOnly(h.db)).toBe(true);
    for (const a of [EMMA, DANIEL, GRACE]) expect(id(a)).toMatchObject({ identityStatus: 'verified', nikMasked: expect.stringMatching(/^3174\*{8}\d{4}$/) });
    const seedRows = h.db.select().from(identityChecks).all();
    expect(seedRows).toHaveLength(3);
    expect(seedRows.every((r) => r.source === 'seed' && JSON.parse(r.checks)[0].detail.includes('No KTP was read'))).toBe(true);
    expect(h.db.select().from(recipients).where(eq(recipients.sample, true)).all().every((r) => r.identityStatus === 'unverified')).toBe(true);
  });
});

describe('the check on synthetic specimens (real face engine, stub reader)', () => {
  it('verifies Emma: KTP read, NIK consistent, name and face match (similarity well above 0.363)', async () => {
    const c = await runSpecimenCheck(h.db, deps, admin, 'emma', NOW);
    expect(c.outcome).toBe('verified');
    expect(c.faceScore!).toBeGreaterThan(0.8);
    expect(c.nikMasked).toBe('3174********0001');
    expect(c.checks.map((x) => [x.key, x.status])).toEqual([
      ['document', 'pass'], ['nik', 'pass'], ['nik_card', 'pass'], ['duplicate', 'pass'], ['name', 'pass'], ['ktp_face', 'pass'], ['selfie_face', 'pass'], ['face_match', 'pass'],
    ]);
    expect(c).toMatchObject({ reader: 'test-stub', source: 'specimen', dryRun: false });
    expect(id(EMMA)).toMatchObject({ identityStatus: 'verified', identityCheckId: c.id });
  });

  it('fails the impostor (Daniel\'s KTP, another face): face similarity far below the threshold; Daniel becomes Failed', async () => {
    const c = await runSpecimenCheck(h.db, deps, admin, 'impostor', NOW);
    expect(c.outcome).toBe('failed');
    expect(c.faceScore!).toBeLessThan(0.28);
    expect(c.checks.find((x) => x.key === 'face_match')).toMatchObject({ status: 'fail', detail: expect.stringMatching(/Different person/) });
    expect(c.checks.filter((x) => x.status !== 'pass').map((x) => x.key)).toEqual(['face_match']);
    expect(id(DANIEL).identityStatus).toBe('failed');
  });

  it('fails a KTP that is already verified for another employee (duplicate NIK) and a name that is not the employee\'s', async () => {
    const c = await runIdentityCheck(h.db, deps, admin, id(GRACE).id, { ktp: spec('emma-ktp.jpg'), face: spec('emma-selfie.jpg') }, { source: 'specimen', dryRun: false, now: NOW });
    expect(c.outcome).toBe('failed');
    expect(c.checks.find((x) => x.key === 'duplicate')).toMatchObject({ status: 'fail', detail: expect.stringMatching(/Emma Clark/) });
    expect(c.checks.find((x) => x.key === 'name')).toMatchObject({ status: 'fail' });
  });

  it('a real upload of a specimen card needs review ("not a real KTP"); a photo instead of a KTP fails', async () => {
    const up = await runIdentityCheck(h.db, deps, admin, id(EMMA).id, { ktp: spec('emma-ktp.jpg'), face: spec('emma-selfie.jpg') }, { source: 'upload', dryRun: false, now: NOW });
    expect(up.outcome).toBe('needs_review');
    expect(up.checks.find((x) => x.key === 'document')).toMatchObject({ status: 'review', detail: expect.stringMatching(/specimen, not a real KTP/) });
    const notKtp = await runIdentityCheck(h.db, deps, admin, id(EMMA).id, { ktp: spec('emma-selfie.jpg'), face: spec('emma-selfie.jpg') }, { source: 'upload', dryRun: false, now: NOW });
    expect(notKtp.outcome).toBe('failed');
    expect(notKtp.checks.find((x) => x.key === 'document')).toMatchObject({ status: 'fail', detail: expect.stringMatching(/not an identity document/) });
  });

  it('refuses files that are not images, before anything is read or recorded', async () => {
    const before = h.db.select().from(identityChecks).all().length;
    await expect(runIdentityCheck(h.db, deps, admin, id(EMMA).id, { ktp: Buffer.from('not an image'), face: spec('emma-selfie.jpg') }, { source: 'upload', dryRun: false, now: NOW }))
      .rejects.toThrow(/KTP image: The file is not a readable image/);
    await expect(runIdentityCheck(h.db, deps, admin, id(EMMA).id, { ktp: spec('emma-ktp.jpg'), face: Buffer.alloc(0) }, { source: 'upload', dryRun: false, now: NOW }))
      .rejects.toThrow(/Face photo: The file is empty/);
    expect(h.db.select().from(identityChecks).all().length).toBe(before);
  });
});

describe('privacy', () => {
  it('the KTP reader receives the card with every face covered (no face is detectable in what it gets)', async () => {
    const seen: Buffer[] = [];
    const stub = stubKtpReader();
    const spy: KtpReader = { id: 'spy', stub: true, read: async (i) => { seen.push(i.prepared); return stub.read(i); } };
    await runSpecimenCheck(h.db, { ...deps, reader: spy }, admin, 'grace', NOW);
    expect(seen).toHaveLength(1);
    expect((await engine.analyze(spec('grace-ktp.jpg'))).faces.length).toBe(1);
    expect((await engine.analyze(seen[0]!)).faces.length).toBe(0);
  });

  it('stores results only: masked NIK and a keyed hash, never the NIK or any image', async () => {
    await runSpecimenCheck(h.db, deps, admin, 'emma', NOW);
    const dump = JSON.stringify([h.db.select().from(identityChecks).all(), h.db.select().from(recipients).where(eq(recipients.nearAccountId, EMMA)).all()], (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
    expect(dump).not.toContain('3174995203940001');
    expect(dump).not.toMatch(/\/9j\/|iVBOR/); // no base64 JPEG/PNG
  });
});

describe('manual review, dry run, log, limits', () => {
  it('a needs-review check is decided by the admin with a reason; withdrawing makes it Failed', async () => {
    await runIdentityCheck(h.db, deps, admin, id(EMMA).id, { ktp: spec('emma-ktp.jpg'), face: spec('emma-selfie.jpg') }, { source: 'upload', dryRun: false, now: NOW });
    expect(id(EMMA).identityStatus).toBe('needs_review');
    expect(() => reviewIdentity(h.db, admin, id(EMMA).id, 'verified', 'ok')).toThrow(/5 to 300/);
    expect(() => reviewIdentity(h.db, maker, id(EMMA).id, 'verified', 'compared by hand')).toThrow(/Only the admin/);
    const r = reviewIdentity(h.db, admin, id(EMMA).id, 'verified', 'Compared the card and the photo myself', NOW);
    expect(r).toMatchObject({ source: 'manual_review', outcome: 'verified', note: 'Compared the card and the photo myself' });
    expect(id(EMMA).identityStatus).toBe('verified');
    expect(() => reviewIdentity(h.db, admin, id(EMMA).id, 'verified', 'again please')).toThrow(/needs review/);
    reviewIdentity(h.db, admin, id(EMMA).id, 'failed', 'Employee left; verification withdrawn', NOW);
    expect(id(EMMA).identityStatus).toBe('failed');
  });

  it('public demo: a specimen check is a dry run (logged, status unchanged)', async () => {
    process.env.HOSTED_DEMO = 'true';
    const c = await runSpecimenCheck(h.db, deps, admin, 'impostor', NOW);
    expect(c).toMatchObject({ outcome: 'failed', dryRun: true });
    expect(id(DANIEL)).toMatchObject({ identityStatus: 'verified' });
    expect(id(DANIEL).identityCheckId).not.toBe(c.id);
  });

  it('the check log is append-only (database triggers); a status can only point at a check of that recipient', async () => {
    const c = await runSpecimenCheck(h.db, deps, admin, 'emma', NOW);
    expect(() => h.sqlite.prepare("update identity_checks set outcome = 'failed' where id = ?").run(c.id)).toThrow(/append-only/);
    expect(() => h.sqlite.prepare('delete from identity_checks where id = ?').run(c.id)).toThrow(/append-only/);
    expect(() => h.sqlite.prepare('update recipients set identity_check_id = ? where near_account_id = ?').run(c.id, GRACE)).toThrow(/non-dry-run check of this recipient/);
  });

  it(`at most ${CHECKS_PER_ADMIN_PER_HOUR} checks per admin per hour; engines off are refused with a clear message`, async () => {
    const ins = h.sqlite.prepare("insert into identity_checks (id, recipient_id, actor_user_id, at, source, dry_run, outcome, checks, reader) values (?, ?, 'usr_admin', ?, 'upload', 0, 'failed', '[]', 'test-stub')");
    for (let i = 0; i < CHECKS_PER_ADMIN_PER_HOUR; i++) ins.run(`idc_fill_${i}`, id(EMMA).id, NOW.getTime() - 60_000);
    await expect(runSpecimenCheck(h.db, deps, admin, 'emma', NOW)).rejects.toBeInstanceOf(IdentityLimitError);
    await expect(runSpecimenCheck(h.db, { ...deps, reader: null }, admin, 'emma', NOW)).rejects.toThrow(/no API key/);
    await expect(runSpecimenCheck(h.db, { ...deps, face: null }, admin, 'emma', NOW)).rejects.toThrow(/vision:models/);
  });
});

describe('payout gate: "Pay identity-verified recipients only"', () => {
  async function upload(title: string) {
    const run = createRun(h.db, { title, postingMode: 'detailed', source: 'upload', makerUserId: maker.id, now: NOW });
    const out = uploadToDraft(h.db, maker, run, { filename: 'live-3-rows.csv', bytes: readFileSync('tests/live/live-3-rows.csv'), expectedRevision: 0, now: NOW });
    expect(out.result.ok).toBe(true);
    return run;
  }

  it('refuses to submit while a recipient is not verified (nothing sent); submits once verified again; off → submits', async () => {
    await runSpecimenCheck(h.db, deps, admin, 'impostor', NOW); // Daniel → failed
    const rows = [{ accountId: EMMA }, { accountId: DANIEL }, { accountId: GRACE }];
    expect(identitySubmitProblem(h.db, rows)).toMatch(/1 of 3 rows pay someone who has not passed the identity check \(KTP \+ face\): Daniel Hall/);
    const run = await upload('Gate');
    const fake = new FakeVault();
    await expect(submitRun(h.db, fake, maker, run, { expectedRevision: 1, now: NOW })).rejects.toThrow(/Pay identity-verified recipients only/);
    expect(fake.calls).toEqual([]);

    await runSpecimenCheck(h.db, deps, admin, 'daniel', NOW); // verified again
    expect(identitySubmitProblem(h.db, rows)).toBeNull();
    expect((await submitRun(h.db, fake, maker, run, { expectedRevision: 1, now: NOW })).status).toBe('submitting');

    setIdentityVerifiedOnly(h.db, admin, false, NOW);
    await runSpecimenCheck(h.db, deps, admin, 'impostor', NOW);
    expect(identitySubmitProblem(h.db, rows)).toBeNull();
  });
});
