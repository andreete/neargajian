/**
 * Phase 24 · the face check at the Payroll Advance request with the REAL face engine (YuNet +
 * SFace, `npm run vision:models`) on the committed SYNTHETIC specimens: templates seeded from the
 * specimen face photos, encrypted in the database; the synthetic head-turn frames
 * (public/specimens/turn/, scripts/make-face-turn-frames.ts) match Emma and do not match the
 * impostor; wrong order, more than one face, no face; no template refused; the template follows
 * the identity check (verified, needs review, failed, reset) and is deleted on deactivation, with
 * every change logged; no image is ever stored; the demo override only with HOSTED_DEMO=true and
 * always flagged; the maker cannot submit a request without a passed check. Also through the HTTP
 * routes (multipart frames → attempt → request).
 */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDatabase, type DatabaseHandle } from '@/server/db/client';
import { seedDemo } from '@/server/db/seed';
import { loadConfig } from '@/server/config';
import { faceTemplateEvents, faceTemplates, payrollAdvances, recipients, users } from '@/server/db/schema';
import { cosine, createFaceEngine, faceModelsPresent, setFaceEngineForTests, type FaceEngine } from '@/server/identity/face';
import { claimFaceCheck, issueChallenge, runFaceCheck, type AttemptView } from '@/server/identity/face-check';
import { decryptTemplate, faceTemplateKey, templateFor } from '@/server/identity/face-template';
import { stubKtpReader } from '@/server/identity/ktp-reader';
import { reviewIdentity, runIdentityCheck, runSpecimenCheck, type IdentityDeps } from '@/server/identity/service';
import { recordReadiness, setRecipientActive } from '@/server/recipients/directory';
import { advanceApprovalProblem, requestAdvance, submitAdvance } from '@/server/advance/service';
import { FakeVault } from '../helpers/fake-vault';

if (!faceModelsPresent()) throw new Error('Face models missing: run `npm run vision:models` before the tests.');
const dir = mkdtempSync(join(tmpdir(), 'sentfund-face-'));
const KEY = randomBytes(32).toString('base64');
afterAll(() => { rmSync(dir, { recursive: true, force: true }); delete process.env.FACE_TEMPLATE_KEY; setFaceEngineForTests(undefined); });
afterEach(() => { delete process.env.HOSTED_DEMO; });

const admin = { id: 'usr_admin', role: 'admin' as const };
const maker = { id: 'usr_maker', role: 'maker' as const };
const emma = { id: 'usr_emp_emma', role: 'employee' as const };
const daniel = { id: 'usr_emp_daniel', role: 'employee' as const };
const NOW = new Date('2026-11-11T09:00:00Z');
const EMMA = 'recipient1.sentfund-payroll.testnet', DANIEL = 'recipient2.sentfund-payroll.testnet', GRACE = 'recipient3.sentfund-payroll.testnet';
const turn = (f: string) => readFileSync(join('public', 'specimens', 'turn', f));
/** What the browser sends: look at the camera, turn one way, then the other. */
const frames = (who: string, order: 'left_right' | 'right_left') => {
  const [a, b] = order === 'left_right' ? ['left', 'right'] : ['right', 'left'];
  return [...Array(2).fill(`${who}-center.jpg`), ...Array(4).fill(`${who}-${a}.jpg`), ...Array(4).fill(`${who}-${b}.jpg`)].map(turn);
};

let engine: FaceEngine;
let h: DatabaseHandle;
let k = 0;
const rid = (account: string) => h.db.select().from(recipients).where(eq(recipients.nearAccountId, account)).get()!.id;

beforeAll(() => { engine = createFaceEngine(); setFaceEngineForTests(engine); }, 60_000);
beforeEach(async () => {
  k += 1;
  process.env.FACE_TEMPLATE_KEY = KEY;
  h = openDatabase(join(dir, `f${k}.sqlite`));
  await seedDemo(h.db, { env: { DEMO_MODE: 'true' }, now: NOW, recipientDirectory: true, testnetHistory: false, demoDraft: false });
  for (const a of [EMMA, DANIEL, GRACE]) recordReadiness(h.db, 'usr_admin', rid(a), 'ready', NOW);
}, 60_000);

async function attempt(who: typeof emma, specimen: string, opts: { order?: 'left_right' | 'right_left'; send?: Buffer[]; at?: Date } = {}): Promise<AttemptView> {
  const at = opts.at ?? NOW;
  const c = issueChallenge(h.db, who, at, { pick: () => ((opts.order ?? 'left_right') === 'left_right' ? 0 : 1) });
  return runFaceCheck(h.db, engine, who, { challengeId: c.challengeId, nonce: c.nonce, frames: opts.send ?? frames(specimen, c.order) }, new Date(at.getTime() + 2000));
}

describe('templates from the synthetic specimen face photos, encrypted at rest', () => {
  it('the seed stores one encrypted template per demo employee; it decrypts only with the key, to the face photo\'s feature vector', async () => {
    const rows = h.db.select().from(faceTemplates).all();
    expect(rows.map((r) => r.recipientId).sort()).toEqual([rid(EMMA), rid(DANIEL), rid(GRACE)].sort());
    const row = rows.find((r) => r.recipientId === rid(EMMA))!;
    expect(row).toMatchObject({ status: 'active', source: 'seed', engine: engine.id });
    expect(row.ciphertext).toMatch(/^v1\./);
    const selfie = (await engine.analyze(readFileSync('public/specimens/emma-selfie.jpg'))).primary!.embedding;
    const plain = Buffer.alloc(512); selfie.forEach((x, i) => plain.writeFloatLE(x, i * 4));
    expect(row.ciphertext).not.toContain(plain.toString('base64').slice(0, 24)); // not the plain numbers
    expect(Buffer.from(row.ciphertext.split('.')[3]!, 'base64url').equals(plain)).toBe(false);
    expect(cosine(decryptTemplate(row.ciphertext, faceTemplateKey()!, rid(EMMA)), selfie)).toBeCloseTo(1, 5);
    expect(() => decryptTemplate(row.ciphertext, randomBytes(32), rid(EMMA))).toThrow();
    const log = h.db.select().from(faceTemplateEvents).all();
    expect(log.map((e) => [e.action, e.reason])).toEqual([['created', 'seed'], ['created', 'seed'], ['created', 'seed']]);
    expect(Object.keys(log[0]!).sort()).toEqual(['action', 'actorUserId', 'at', 'id', 'identityCheckId', 'reason', 'recipientId']); // no biometric data
    // Seeding again changes nothing (idempotent).
    await seedDemo(h.db, { env: { DEMO_MODE: 'true' }, now: NOW, recipientDirectory: true, testnetHistory: false, demoDraft: false });
    expect(h.db.select().from(faceTemplateEvents).all()).toHaveLength(3);
  });
  it('without FACE_TEMPLATE_KEY nothing is stored', async () => {
    delete process.env.FACE_TEMPLATE_KEY;
    const h2 = openDatabase(join(dir, `nokey${k}.sqlite`));
    await seedDemo(h2.db, { env: { DEMO_MODE: 'true' }, now: NOW, recipientDirectory: true, testnetHistory: false, demoDraft: false });
    expect(h2.db.select().from(faceTemplates).all()).toHaveLength(0);
    h2.sqlite.close();
  });
});

describe('the camera check with the real face engine', () => {
  it('Emma turning as asked (both orders): passed, similarity far above 0.363', async () => {
    for (const order of ['left_right', 'right_left'] as const) {
      const a = await attempt(emma, 'emma', { order });
      expect(a, order).toMatchObject({ outcome: 'passed', passed: true, livenessPassed: true, order, overrideAvailable: false });
      expect(a.similarity!).toBeGreaterThan(0.9);
    }
  }, 60_000);
  it('someone else (the impostor) turning as asked: "This doesn\'t look like Emma Clark", liveness passed', async () => {
    const a = await attempt(emma, 'impostor');
    expect(a).toMatchObject({ outcome: 'mismatch', passed: false, livenessPassed: true, message: "This doesn't look like Emma Clark.", overrideAvailable: false });
    expect(a.similarity!).toBeLessThan(0.363);
    // Daniel's frames against Emma's template too.
    expect((await attempt(emma, 'daniel', { at: new Date(NOW.getTime() + 10_000) })).outcome).toBe('mismatch');
  }, 60_000);
  it('the wrong order, a still photo, more than one face, no face', async () => {
    const wrong = await attempt(emma, 'emma', { order: 'left_right', send: frames('emma', 'right_left') });
    expect(wrong).toMatchObject({ outcome: 'turn', livenessPassed: false, similarity: null, message: 'Please turn your head as asked: slowly to the left, then to the right.' });
    const still = await attempt(emma, 'emma', { send: Array(8).fill(turn('emma-center.jpg')), at: new Date(NOW.getTime() + 5000) });
    expect(still.outcome).toBe('turn');
    const two = await sharp({ create: { width: 960, height: 480, channels: 3, background: '#808080' } })
      .composite([{ input: turn('emma-center.jpg'), left: 0, top: 0 }, { input: turn('impostor-center.jpg'), left: 480, top: 0 }]).jpeg({ quality: 80 }).toBuffer();
    const many = await attempt(emma, 'emma', { send: [two, ...frames('emma', 'left_right').slice(1)], at: new Date(NOW.getTime() + 10_000) });
    expect(many).toMatchObject({ outcome: 'multiple_faces', message: expect.stringMatching(/^More than one face/) });
    const blank = await sharp({ create: { width: 480, height: 480, channels: 3, background: '#335577' } }).jpeg().toBuffer();
    const none = await attempt(emma, 'emma', { send: [blank, ...frames('emma', 'left_right').slice(1)], at: new Date(NOW.getTime() + 15_000) });
    expect(none).toMatchObject({ outcome: 'no_face', message: expect.stringMatching(/^No face found/) });
  }, 90_000);
  it('a request needs a passed check of the same employee, used once within 5 minutes', async () => {
    const pass = await attempt(emma, 'emma');
    const at = new Date(NOW.getTime() + 60_000);
    expect(() => requestAdvance(h.db, emma, { amount: '0.30', consent: true }, at)).toThrow("Verify it's you with the camera first");
    expect(() => requestAdvance(h.db, emma, { amount: '0.30', consent: true, faceAttemptId: pass.attemptId }, new Date(NOW.getTime() + 6 * 60_000))).toThrow(/older than 5 minutes/);
    const a = requestAdvance(h.db, emma, { amount: '0.30', consent: true, faceAttemptId: pass.attemptId }, at);
    expect(JSON.parse(a.faceCheck!)).toMatchObject({ result: 'passed', threshold: 0.363, order: 'left_right', attemptId: pass.attemptId });
    expect(JSON.parse(a.faceCheck!).similarity).toBeGreaterThan(0.9);
    expect(() => h.db.update(payrollAdvances).set({ faceCheck: null }).where(eq(payrollAdvances.id, a.id)).run()).toThrow(/fixed/);
    // Another employee cannot use Emma's check; a check is used once.
    expect(() => claimFaceCheck(h.db, daniel, rid(DANIEL), pass.attemptId, false, at)).toThrow("Verify it's you with the camera first");
    expect(() => claimFaceCheck(h.db, emma, rid(EMMA), pass.attemptId, false, at)).toThrow(/already used/);
  }, 60_000);
});

describe('the public demo override', () => {
  it('HOSTED_DEMO off: a mismatch is refused, even when asked for the override', async () => {
    const miss = await attempt(emma, 'impostor');
    expect(() => requestAdvance(h.db, emma, { amount: '0.30', consent: true, faceAttemptId: miss.attemptId }, NOW)).toThrow("The face check did not pass: This doesn't look like Emma Clark.");
    expect(() => requestAdvance(h.db, emma, { amount: '0.30', consent: true, faceAttemptId: miss.attemptId, demoOverride: true }, NOW)).toThrow(/no demo override outside the public demo/);
    expect(h.db.select().from(payrollAdvances).all()).toHaveLength(0);
  }, 60_000);
  it('HOSTED_DEMO=true: offered after a mismatch with a passed head turn, flagged on the request; never after a failed head turn', async () => {
    process.env.HOSTED_DEMO = 'true';
    const wrongTurn = await attempt(emma, 'impostor', { order: 'left_right', send: frames('impostor', 'right_left') });
    expect(wrongTurn).toMatchObject({ outcome: 'turn', overrideAvailable: false });
    expect(() => requestAdvance(h.db, emma, { amount: '0.30', consent: true, faceAttemptId: wrongTurn.attemptId, demoOverride: true }, NOW)).toThrow(/head-turn check must pass/);
    const miss = await attempt(emma, 'impostor', { at: new Date(NOW.getTime() + 5000) });
    expect(miss).toMatchObject({ outcome: 'mismatch', overrideAvailable: true });
    expect(() => requestAdvance(h.db, emma, { amount: '0.30', consent: true, faceAttemptId: miss.attemptId }, NOW)).toThrow(/did not pass/); // only when asked
    const a = requestAdvance(h.db, emma, { amount: '0.30', consent: true, faceAttemptId: miss.attemptId, demoOverride: true }, new Date(NOW.getTime() + 10_000));
    expect(JSON.parse(a.faceCheck!)).toMatchObject({ result: 'demo_override', attemptId: miss.attemptId });
    // The maker and the approvers accept it only in the public demo.
    delete process.env.HOSTED_DEMO;
    await expect(submitAdvance(h.db, new FakeVault(), maker, a.id, NOW)).rejects.toThrow(/not accepted outside the public demo/);
  }, 90_000);
});

describe('the maker cannot submit a request without a passed face check', () => {
  it('a request without any face check (made before Phase 24) is refused at submit and at approval', async () => {
    const pass = await attempt(emma, 'emma');
    const a = requestAdvance(h.db, emma, { amount: '0.20', consent: true, faceAttemptId: pass.attemptId }, NOW);
    // A request stored before Phase 24 has no face check: simulated by inserting such a row.
    const old = { ...h.db.select().from(payrollAdvances).where(eq(payrollAdvances.id, a.id)).get()!, id: 'adv_pre24', recipientId: rid(GRACE), employeeUserId: 'usr_emp_grace', faceCheck: null, faceAttemptId: null };
    h.db.insert(payrollAdvances).values(old).run();
    const fake = new FakeVault();
    fake.balance = 2_000_000n;
    await expect(submitAdvance(h.db, fake, maker, 'adv_pre24', NOW)).rejects.toThrow(/no passed face check/);
    expect(fake.calls).toHaveLength(0);
    const sent = await submitAdvance(h.db, fake, maker, a.id, NOW);
    expect(sent.submit.status).not.toBe('submit_failed');
    expect(advanceApprovalProblem(h.db, sent.runId, NOW)).toBeNull();
  }, 60_000);
});

describe('the template follows the identity check, deactivation deletes it, everything is logged', () => {
  const deps = (): IdentityDeps => ({ face: engine, reader: stubKtpReader(), secret: loadConfig().sessionSecret });
  it('deactivation deletes the template: the employee is then told to ask the admin', async () => {
    setRecipientActive(h.db, admin, rid(DANIEL), false, NOW);
    expect(h.db.select().from(faceTemplates).where(eq(faceTemplates.recipientId, rid(DANIEL))).get()).toBeUndefined();
    expect(h.db.select().from(faceTemplateEvents).where(eq(faceTemplateEvents.recipientId, rid(DANIEL))).all().map((e) => [e.action, e.reason, e.actorUserId])).toEqual([['created', 'seed', null], ['deleted', 'deactivated', 'usr_admin']]);
    expect(() => issueChallenge(h.db, daniel, NOW)).toThrow('Ask your admin to verify your identity first.');
    setRecipientActive(h.db, admin, rid(DANIEL), true, NOW); // reactivation does not bring it back
    expect(templateFor(h.db, rid(DANIEL)).state).toBe('none');
  });
  it('a verified identity check stores the face photo\'s template; a failed one (impostor) and a withdrawn verification delete it', async () => {
    const before = h.db.select().from(faceTemplates).where(eq(faceTemplates.recipientId, rid(EMMA))).get()!;
    const c = await runSpecimenCheck(h.db, deps(), admin, 'emma', NOW);
    expect(c.outcome).toBe('verified');
    const after = h.db.select().from(faceTemplates).where(eq(faceTemplates.recipientId, rid(EMMA))).get()!;
    expect(after).toMatchObject({ status: 'active', source: 'identity_check', identityCheckId: c.id });
    expect(after.ciphertext).not.toBe(before.ciphertext);
    const imp = await runSpecimenCheck(h.db, deps(), admin, 'impostor', NOW);
    expect(imp.outcome).toBe('failed');
    expect(templateFor(h.db, rid(DANIEL)).state).toBe('none');
    reviewIdentity(h.db, admin, rid(EMMA), 'failed', 'Verification withdrawn for the test', NOW);
    expect(templateFor(h.db, rid(EMMA)).state).toBe('none');
    const log = h.db.select().from(faceTemplateEvents).all().slice(3).map((e) => [e.action, e.reason]);
    expect(log).toEqual([['replaced', 'identity_verified'], ['deleted', 'identity_failed'], ['deleted', 'identity_reset']]);
    expect(() => h.db.delete(faceTemplateEvents).run()).toThrow(/append-only/);
  }, 90_000);
  it('needs review → a pending template (not usable); the admin approves → active', async () => {
    // A check that needs review: Emma's own card and face photo, with a name the directory spells slightly differently.
    h.db.update(recipients).set({ name: 'Emma Clarke' }).where(eq(recipients.id, rid(EMMA))).run();
    const c = await runIdentityCheck(h.db, deps(), admin, rid(EMMA), { ktp: readFileSync('public/specimens/emma-ktp.jpg'), face: readFileSync('public/specimens/emma-selfie.jpg') }, { source: 'upload', dryRun: false, now: NOW });
    expect(c.outcome).toBe('needs_review');
    expect(templateFor(h.db, rid(EMMA)).state).toBe('pending');
    expect(() => issueChallenge(h.db, emma, NOW)).toThrow('Ask your admin to verify your identity first.');
    reviewIdentity(h.db, admin, rid(EMMA), 'verified', 'Same person; the directory spelling differs', NOW);
    expect(templateFor(h.db, rid(EMMA)).state).toBe('active');
    expect((await attempt(emma, 'emma')).outcome).toBe('passed');
  }, 90_000);
});

describe('no image is ever stored', () => {
  it('after checks of every kind, no table holds image data', async () => {
    await attempt(emma, 'emma');
    await attempt(emma, 'impostor', { at: new Date(NOW.getTime() + 5000) });
    await runSpecimenCheck(h.db, { face: engine, reader: stubKtpReader(), secret: loadConfig().sessionSecret }, admin, 'grace', NOW);
    const tables = (h.sqlite.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle%'").all() as { name: string }[]).map((t) => t.name);
    let cells = 0;
    for (const t of tables) {
      for (const row of h.sqlite.prepare(`select * from "${t}"`).all() as Record<string, unknown>[]) {
        for (const [col, v] of Object.entries(row)) {
          cells++;
          expect(Buffer.isBuffer(v), `${t}.${col} is a blob`).toBe(false);
          if (typeof v === 'string') {
            expect(v.includes('/9j/') || v.includes('iVBORw0KGgo') || v.length > 20_000, `${t}.${col} looks like an image`).toBe(false);
          }
        }
      }
    }
    expect(cells).toBeGreaterThan(1000);
    expect(tables).toEqual(expect.arrayContaining(['face_templates', 'face_check_attempts', 'face_challenges', 'face_template_events']));
  }, 90_000);
});

describe('through the HTTP routes (multipart frames → attempt → request)', () => {
  it('the employee verifies and requests; the answer carries the result', async () => {
    const { closeDatabase } = await import('@/server/db/client');
    const file = join(dir, `route${k}.sqlite`);
    closeDatabase();
    process.env.DATABASE_URL = `file:${file}`;
    const { getDb } = await import('@/server/db/client');
    const db = getDb();
    await seedDemo(db, { env: { DEMO_MODE: 'true' }, now: new Date(), recipientDirectory: true, testnetHistory: false, demoDraft: false });
    const emmaId = db.select({ r: users.recipientId }).from(users).where(eq(users.id, emma.id)).get()!.r!;
    recordReadiness(db, 'usr_admin', emmaId, 'ready', new Date());
    const { createSession, SESSION_COOKIE } = await import('@/server/auth/session');
    const s = createSession(db, emma.id, new Date());
    const BASE = loadConfig().baseUrl.origin;
    const headers = () => new Headers({ origin: BASE, cookie: `${SESSION_COOKIE}=${s.token}`, 'x-csrf-token': s.csrfToken });
    const challengeRoute = await import('@/app/api/employee/face-check/challenge/route');
    const checkRoute = await import('@/app/api/employee/face-check/route');
    const advRoute = await import('@/app/api/employee/advances/route');
    const ch = (await (await challengeRoute.POST(new Request(`${BASE}/api/employee/face-check/challenge`, { method: 'POST', headers: headers() }))).json()) as { challenge: { challengeId: string; nonce: string; order: 'left_right' | 'right_left' } };
    const form = new FormData();
    form.set('challengeId', ch.challenge.challengeId);
    form.set('nonce', ch.challenge.nonce);
    for (const f of frames('emma', ch.challenge.order)) form.append('frames', new File([f], 'f.jpg', { type: 'image/jpeg' }));
    const res = await checkRoute.POST(new Request(`${BASE}/api/employee/face-check`, { method: 'POST', headers: headers(), body: form }));
    expect(res.status).toBe(200);
    const { attempt: at } = (await res.json()) as { attempt: AttemptView };
    expect(at).toMatchObject({ outcome: 'passed', passed: true });
    const h2 = headers(); h2.set('content-type', 'application/json');
    const made = await advRoute.POST(new Request(`${BASE}/api/employee/advances`, { method: 'POST', headers: h2, body: JSON.stringify({ amount: '0.30', consent: true, faceAttemptId: at.attemptId }) }));
    expect(made.status).toBe(201);
    const again = await advRoute.POST(new Request(`${BASE}/api/employee/advances`, { method: 'POST', headers: h2, body: JSON.stringify({ amount: '0.10', consent: true, faceAttemptId: at.attemptId }) }));
    expect([409, 422]).toContain(again.status); // one open advance, and the check is used up
    closeDatabase();
    delete process.env.DATABASE_URL;
  }, 90_000);
});
