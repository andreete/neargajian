/**
 * Identity check (Phase 21, admin only): does the employee's KTP belong to them, and is the face
 * on the KTP the same person as the employee's face photo?
 *
 * 1. Both images are decoded on this server. Every face on the KTP is found (YuNet) and COVERED
 *    with a solid block before the card goes to the KTP reader (Claude vision), which returns the
 *    printed fields.
 * 2. Offline checks: document kind, NIK structure (province, date, serial), NIK vs date of birth
 *    and sex on the same card, the name vs the directory, the same NIK already verified for
 *    another employee (keyed hash).
 * 3. Face match on this server (SFace): the KTP photo vs the face photo, cosine similarity;
 *    exactly one clear face in the face photo.
 * 4. Outcome: any fail → failed; any review → needs_review (the admin decides, with a reason);
 *    else verified. Images are discarded; only results, a masked NIK and its keyed hash are kept.
 *
 * Not a Dukcapil (government registry) check and not liveness detection: said in the UI and docs.
 * "Pay identity-verified recipients only" (setting) blocks submitting a run that pays anyone not
 * verified, re-checked on the server at submit.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { and, count, desc, eq, gte, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { Principal } from '../auth/policy.ts';
import type { Db, Queryable } from '../db/client.ts';
import {
  appSettings, auditEvents, identityChecks, recipients, users,
  type IdentityOutcome, type IdentitySource, type IdentityStatus,
} from '../db/schema.ts';
import { hostedMode } from '../hosted.ts';
import { DomainError } from '../runs/repository.ts';
import { SFACE_COSINE_THRESHOLD, cosine, decodeImage, ImageError, type FaceAnalysis, type FaceEngine, type RgbImage } from './face.ts';
import { SPECIMEN_DIR, specimenManifest, type KtpReader, type KtpReading } from './ktp-reader.ts';
import { compareNames, maskNik, nikHash, nikMatchesCard, parseNik } from './nik.ts';

export const IDENTITY_ONLY_KEY = 'identity_verified_only';
/** Below the OpenCV threshold but this close: a person decides. */
export const FACE_REVIEW_FLOOR = 0.28;
export const CHECKS_PER_ADMIN_PER_HOUR = 30;
export const HOSTED_IDENTITY_DAILY_CAP = 100;

export const STATUS_LABEL: Record<IdentityStatus, string> = {
  unverified: 'Not checked', verified: 'Identity verified', needs_review: 'Needs review', failed: 'Failed',
};

export type CheckStatus = 'pass' | 'review' | 'fail';
export interface CheckItem { key: string; label: string; status: CheckStatus; detail: string }

export class IdentityLimitError extends Error {
  constructor(message: string) { super(message); this.name = 'IdentityLimitError'; }
}

export interface IdentityDeps { face: FaceEngine | null; reader: KtpReader | null; secret: string }

// ------------------------------------------------------------------ setting

export function identityVerifiedOnly(db: Queryable): boolean {
  return db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, IDENTITY_ONLY_KEY)).get()?.value === 'true';
}

function requireAdmin(actor: Principal) {
  if (actor.role !== 'admin') throw new DomainError('forbidden', 'Only the admin runs identity checks.');
}

export function setIdentityVerifiedOnly(db: Db, actor: Principal, on: boolean, now: Date) {
  requireAdmin(actor);
  db.transaction((tx) => {
    const before = identityVerifiedOnly(tx);
    tx.insert(appSettings).values({ key: IDENTITY_ONLY_KEY, value: String(on), updatedByUserId: actor.id, updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: String(on), updatedByUserId: actor.id, updatedAt: now } }).run();
    if (before !== on) {
      tx.insert(auditEvents).values({ at: now, actorUserId: actor.id, action: on ? 'settings.identity_only_on' : 'settings.identity_only_off', entityType: 'setting', entityId: IDENTITY_ONLY_KEY, detail: JSON.stringify({ from: before, to: on }) }).run();
    }
  }, { behavior: 'immediate' });
}

// ------------------------------------------------------------------ the check (pure decision)

const has = (concerns: string[], re: RegExp) => concerns.some((c) => re.test(c));

/** All checks from the reader's fields and the two face analyses. Pure: unit-tested. */
export function evaluate(input: {
  directoryName: string;
  reading: KtpReading;
  ktpFaces: FaceAnalysis;
  selfie: FaceAnalysis;
  source: IdentitySource;
  duplicateOf: { name: string; account: string } | null;
}): { checks: CheckItem[]; outcome: IdentityOutcome; faceScore: number | null; nik: string | null } {
  const { reading, ktpFaces, selfie } = input;
  const checks: CheckItem[] = [];
  const add = (key: string, label: string, status: CheckStatus, detail: string) => checks.push({ key, label, status, detail });

  // Document
  const docLabel = 'Document is a KTP';
  if (reading.document === 'ktp') add('document', docLabel, reading.legibility === 'poor' ? 'review' : 'pass', reading.legibility === 'clear' ? 'Read as an Indonesian KTP; text clear.' : `Read as an Indonesian KTP; text ${reading.legibility === 'partly' ? 'partly' : 'poorly'} legible.`);
  else if (reading.document === 'ktp_specimen') add('document', docLabel, input.source === 'specimen' ? 'pass' : 'review', input.source === 'specimen' ? 'Synthetic specimen card (public demo data), read as a KTP layout.' : 'The card is marked as a specimen, not a real KTP.');
  else if (reading.document === 'other_id') add('document', docLabel, 'fail', 'This is another identity document, not a KTP.');
  else if (reading.document === 'not_id') add('document', docLabel, 'fail', 'This is not an identity document.');
  else add('document', docLabel, 'fail', 'The card could not be read (too blurred, dark or cropped).');
  const concerns = reading.concerns.filter((c) => !(input.source === 'specimen' && /specimen|sample|contoh|not a real/i.test(c)));
  if (concerns.length) {
    const serious = has(concerns, /edit|tamper|alter|screen|monitor|photocop|fake|forg/i);
    add('document_concerns', 'Document looks genuine (visual)', 'review', `${serious ? 'Possible tampering or a copy: ' : ''}${concerns.join('; ')}`);
  }

  // NIK
  let nik: string | null = null;
  if (!reading.nik) add('nik', 'NIK readable and well-formed', 'fail', 'The 16-digit NIK is not fully legible.');
  else {
    const parsed = parseNik(reading.nik);
    if (!parsed.ok) add('nik', 'NIK readable and well-formed', 'fail', parsed.reason);
    else {
      nik = parsed.nik;
      add('nik', 'NIK readable and well-formed', 'pass', `${maskNik(nik)}: province ${parsed.parts.provinceName} (${parsed.parts.province}), born ${String(parsed.parts.birthDay).padStart(2, '0')}-${String(parsed.parts.birthMonth).padStart(2, '0')}-..${String(parsed.parts.birthYear2).padStart(2, '0')}, ${parsed.parts.female ? 'female' : 'male'} by the NIK.`);
      const m = nikMatchesCard(parsed.parts, reading.birth_date, reading.gender);
      if (m.date === false || m.sex === false) add('nik_card', 'NIK agrees with the card', 'fail', `${m.date === false ? 'The date of birth printed on the card differs from the one in the NIK. ' : ''}${m.sex === false ? 'The sex printed on the card differs from the one in the NIK.' : ''}`.trim());
      else if (m.date === null || m.sex === null) add('nik_card', 'NIK agrees with the card', 'review', 'The date of birth or sex on the card could not be read to compare with the NIK.');
      else add('nik_card', 'NIK agrees with the card', 'pass', 'Date of birth and sex on the card match the NIK.');
    }
  }
  if (input.duplicateOf) add('duplicate', 'NIK not used by another employee', 'fail', `This NIK is already verified for ${input.duplicateOf.name} (${input.duplicateOf.account}).`);
  else if (nik) add('duplicate', 'NIK not used by another employee', 'pass', 'No other employee is verified with this NIK.');

  // Name
  if (!reading.name) add('name', 'Name matches the directory', 'fail', 'The name on the card is not legible.');
  else {
    const c = compareNames(input.directoryName, reading.name);
    add('name', 'Name matches the directory', c === 'match' ? 'pass' : c === 'close' ? 'review' : 'fail',
      c === 'match' ? `"${reading.name}" on the card matches "${input.directoryName}".` : c === 'close' ? `"${reading.name}" on the card is close to "${input.directoryName}" but not the same.` : `"${reading.name}" on the card is not "${input.directoryName}".`);
  }

  // Faces
  if (!ktpFaces.primary) add('ktp_face', 'Face photo found on the KTP', 'fail', 'No face was found on the KTP image.');
  else add('ktp_face', 'Face photo found on the KTP', 'pass', `Found (detector confidence ${ktpFaces.primary.face.score.toFixed(2)}).`);
  const sp = selfie.primary;
  if (!sp) add('selfie_face', 'One clear face in the face photo', 'fail', 'No face was found in the face photo.');
  else {
    const problems: string[] = [];
    if (selfie.faces.length > 1) problems.push(`${selfie.faces.length} faces in the photo`);
    if (sp.face.box.w < 80) problems.push(`the face is small (${Math.round(sp.face.box.w)} px wide; 80+ is better)`);
    if (sp.sharpness < 40) problems.push('the face is blurry');
    if (sp.brightness < 45) problems.push('the photo is too dark');
    if (sp.brightness > 215) problems.push('the photo is overexposed');
    add('selfie_face', 'One clear face in the face photo', problems.length ? 'review' : 'pass', problems.length ? `Check the photo: ${problems.join('; ')}.` : `One face (confidence ${sp.face.score.toFixed(2)}), sharp and well lit.`);
  }
  let faceScore: number | null = null;
  if (ktpFaces.primary && sp) {
    faceScore = cosine(ktpFaces.primary.embedding, sp.embedding);
    const s = faceScore.toFixed(3);
    add('face_match', 'Face photo matches the KTP photo', faceScore >= SFACE_COSINE_THRESHOLD ? 'pass' : faceScore >= FACE_REVIEW_FLOOR ? 'review' : 'fail',
      faceScore >= SFACE_COSINE_THRESHOLD ? `Same person: similarity ${s} (threshold ${SFACE_COSINE_THRESHOLD}).` : faceScore >= FACE_REVIEW_FLOOR ? `Unclear: similarity ${s}, just below the threshold ${SFACE_COSINE_THRESHOLD}. A person should compare the photos.` : `Different person: similarity ${s} (threshold ${SFACE_COSINE_THRESHOLD}).`);
  }

  const outcome: IdentityOutcome = checks.some((c) => c.status === 'fail') ? 'failed' : checks.some((c) => c.status === 'review') ? 'needs_review' : 'verified';
  return { checks, outcome, faceScore, nik };
}

// ------------------------------------------------------------------ running a check

/**
 * The KTP as it is sent to the reader: every face the detector finds is COVERED with a solid
 * block (with a margin), so no face information leaves this server; longest side ≤ 1600 px, JPEG.
 * (Blurring was not enough: the detector still found a face in a blurred photo.)
 */
export async function prepareKtpForReader(img: RgbImage, faces: FaceAnalysis['faces']): Promise<Buffer> {
  const overlays: OverlayOptions[] = [];
  for (const f of faces) {
    const padX = f.box.w * 0.35, padY = f.box.h * 0.35;
    const left = Math.max(0, Math.floor(f.box.x - padX)), top = Math.max(0, Math.floor(f.box.y - padY));
    const width = Math.min(img.width - left, Math.ceil(f.box.w + 2 * padX)), height = Math.min(img.height - top, Math.ceil(f.box.h + 2 * padY));
    if (width < 2 || height < 2) continue;
    overlays.push({ input: { create: { width, height, channels: 3, background: { r: 190, g: 196, b: 206 } } }, left, top });
  }
  return sharp(img.data, { raw: { width: img.width, height: img.height, channels: 3 } })
    .composite(overlays).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
}

function limits(db: Queryable, actor: Principal, now: Date) {
  const hour = db.select({ n: count() }).from(identityChecks)
    .where(and(eq(identityChecks.actorUserId, actor.id), isNotNull(identityChecks.reader), gte(identityChecks.at, new Date(now.getTime() - 3_600_000)))).get()?.n ?? 0;
  if (hour >= CHECKS_PER_ADMIN_PER_HOUR) throw new IdentityLimitError(`You ran ${CHECKS_PER_ADMIN_PER_HOUR} identity checks in the last hour, the limit. Try again later.`);
  if (hostedMode().demo) {
    const day = db.select({ n: count() }).from(identityChecks)
      .where(and(isNotNull(identityChecks.reader), gte(identityChecks.at, new Date(now.getTime() - 86_400_000)))).get()?.n ?? 0;
    if (day >= HOSTED_IDENTITY_DAILY_CAP) throw new IdentityLimitError(`The public demo ran ${HOSTED_IDENTITY_DAILY_CAP} identity checks in the last 24 hours, its daily limit. Try again tomorrow.`);
  }
}

export interface IdentityCheckView {
  id: string; recipientId: string; recipientName: string; account: string; at: Date; actor: string;
  source: IdentitySource; dryRun: boolean; outcome: IdentityOutcome; nikMasked: string | null; faceScore: number | null;
  checks: CheckItem[]; reader: string | null; faceEngine: string | null; note: string | null;
}

function view(db: Queryable, id: string): IdentityCheckView {
  const r = db.select({ c: identityChecks, name: recipients.name, account: recipients.nearAccountId, actor: users.displayName })
    .from(identityChecks).innerJoin(recipients, eq(recipients.id, identityChecks.recipientId)).leftJoin(users, eq(users.id, identityChecks.actorUserId))
    .where(eq(identityChecks.id, id)).get();
  if (!r) throw new DomainError('not_found', 'Identity check not found.');
  return {
    id: r.c.id, recipientId: r.c.recipientId, recipientName: r.name, account: r.account, at: r.c.at, actor: r.actor ?? '—',
    source: r.c.source, dryRun: r.c.dryRun, outcome: r.c.outcome, nikMasked: r.c.nikMasked, faceScore: r.c.faceScore,
    checks: JSON.parse(r.c.checks) as CheckItem[], reader: r.c.reader, faceEngine: r.c.faceEngine, note: r.c.note,
  };
}

function record(db: Db, row: typeof identityChecks.$inferInsert, apply: boolean): IdentityCheckView {
  db.transaction((tx) => {
    tx.insert(identityChecks).values(row).run();
    if (apply) {
      tx.update(recipients).set({
        identityStatus: row.outcome, identityCheckedAt: row.at, identityCheckId: row.id,
        ...(row.nikHash ? { nikMasked: row.nikMasked, nikHash: row.nikHash } : {}),
      }).where(eq(recipients.id, row.recipientId)).run();
    }
    tx.insert(auditEvents).values({ at: row.at!, actorUserId: row.actorUserId, action: row.source === 'manual_review' ? 'identity.reviewed' : 'identity.checked', entityType: 'recipient', entityId: row.recipientId, detail: JSON.stringify({ check: row.id, outcome: row.outcome, source: row.source, dryRun: row.dryRun ?? false }) }).run();
  }, { behavior: 'immediate' });
  return view(db, row.id!);
}

export async function runIdentityCheck(
  db: Db, deps: IdentityDeps, actor: Principal, recipientId: string,
  images: { ktp: Buffer; face: Buffer },
  opts: { source: 'upload' | 'specimen'; dryRun: boolean; note?: string; now?: Date },
): Promise<IdentityCheckView> {
  requireAdmin(actor);
  const now = opts.now ?? new Date();
  const recipient = db.select().from(recipients).where(eq(recipients.id, recipientId)).get();
  if (!recipient) throw new DomainError('not_found', 'Recipient not found.');
  if (!deps.face) throw new DomainError('conflict', 'The face engine is off on this copy: the model files are missing. Run `npm run vision:models`, then restart.');
  if (!deps.reader) throw new DomainError('conflict', 'The KTP reader is off on this copy (no API key). Identity checks need ANTHROPIC_API_KEY.');
  limits(db, actor, now);

  let ktpImg: RgbImage, faceImg: RgbImage;
  try { ktpImg = await decodeImage(images.ktp); } catch (e) { throw new DomainError('invalid', `KTP image: ${e instanceof ImageError ? e.message : 'not readable.'}`); }
  try { faceImg = await decodeImage(images.face); } catch (e) { throw new DomainError('invalid', `Face photo: ${e instanceof ImageError ? e.message : 'not readable.'}`); }

  const ktpFaces = await deps.face.analyzeImage(ktpImg);
  const prepared = await prepareKtpForReader(ktpImg, ktpFaces.faces);
  const reading = await deps.reader.read({ original: images.ktp, prepared });
  const selfie = await deps.face.analyzeImage(faceImg);

  const parsed = reading.nik ? parseNik(reading.nik) : null;
  const hash = parsed?.ok ? nikHash(parsed.nik, deps.secret) : null;
  const dup = hash ? db.select({ name: recipients.name, account: recipients.nearAccountId }).from(recipients)
    .where(and(eq(recipients.nikHash, hash), eq(recipients.identityStatus, 'verified'), ne(recipients.id, recipientId))).get() ?? null : null;

  const result = evaluate({ directoryName: recipient.name, reading, ktpFaces, selfie, source: opts.source, duplicateOf: dup });
  return record(db, {
    id: `idc_${randomUUID()}`, recipientId, actorUserId: actor.id, at: now, source: opts.source, dryRun: opts.dryRun,
    outcome: result.outcome, nikMasked: result.nik ? maskNik(result.nik) : null, nikHash: hash, faceScore: result.faceScore,
    checks: JSON.stringify(result.checks), reader: deps.reader.id, faceEngine: deps.face.id, note: opts.note ?? null,
  }, !opts.dryRun);
}

/** The admin decides a "Needs review" check, or withdraws a verification, with a reason. */
export function reviewIdentity(db: Db, actor: Principal, recipientId: string, decision: 'verified' | 'failed', reason: string, now = new Date()): IdentityCheckView {
  requireAdmin(actor);
  const recipient = db.select().from(recipients).where(eq(recipients.id, recipientId)).get();
  if (!recipient) throw new DomainError('not_found', 'Recipient not found.');
  const why = reason.trim();
  if (why.length < 5 || why.length > 300) throw new DomainError('invalid', 'Give a reason of 5 to 300 characters.');
  if (decision === 'verified' && recipient.identityStatus !== 'needs_review') throw new DomainError('conflict', 'Only a check that needs review can be approved by hand. Run a new check instead.');
  if (decision === 'failed' && recipient.identityStatus === 'unverified') throw new DomainError('conflict', 'This recipient has not been checked yet.');
  if (decision === 'verified' && recipient.nikHash) {
    const dup = db.select({ name: recipients.name }).from(recipients).where(and(eq(recipients.nikHash, recipient.nikHash), eq(recipients.identityStatus, 'verified'), ne(recipients.id, recipientId))).get();
    if (dup) throw new DomainError('conflict', `This NIK is already verified for ${dup.name}.`);
  }
  const checks: CheckItem[] = [{ key: 'manual', label: decision === 'verified' ? 'Approved by the admin after review' : 'Marked as failed by the admin', status: decision === 'verified' ? 'pass' : 'fail', detail: why }];
  return record(db, {
    id: `idc_${randomUUID()}`, recipientId, actorUserId: actor.id, at: now, source: 'manual_review', dryRun: false, outcome: decision,
    nikMasked: recipient.nikMasked, nikHash: recipient.nikHash, faceScore: null, checks: JSON.stringify(checks), reader: null, faceEngine: null, note: why,
  }, true);
}

// ------------------------------------------------------------------ specimens (synthetic demo data)

export const SPECIMEN_SCENARIOS = {
  'emma': { label: 'Emma Clark: her KTP and her face photo', person: 'emma', ktp: 'emma-ktp.jpg', face: 'emma-selfie.jpg' },
  'daniel': { label: 'Daniel Hall: his KTP and his face photo', person: 'daniel', ktp: 'daniel-ktp.jpg', face: 'daniel-selfie.jpg' },
  'grace': { label: 'Grace Lewis: her KTP and her face photo', person: 'grace', ktp: 'grace-ktp.jpg', face: 'grace-selfie.jpg' },
  'impostor': { label: 'Impostor: Daniel Hall\'s KTP with someone else\'s face', person: 'daniel', ktp: 'daniel-ktp.jpg', face: 'impostor-selfie.jpg' },
} as const;
export type SpecimenScenario = keyof typeof SPECIMEN_SCENARIOS;

/** Runs the full check on a committed synthetic specimen. Public demo: dry run (status unchanged). */
export async function runSpecimenCheck(db: Db, deps: IdentityDeps, actor: Principal, scenario: SpecimenScenario, now = new Date()): Promise<IdentityCheckView> {
  const s = SPECIMEN_SCENARIOS[scenario];
  if (!s) throw new DomainError('invalid', 'Unknown specimen.');
  const person = specimenManifest().people.find((p) => p.key === s.person);
  const recipient = person ? db.select().from(recipients).where(eq(recipients.nearAccountId, person.account)).get() : undefined;
  if (!recipient) throw new DomainError('not_found', 'The specimen\'s recipient is not in the directory.');
  return runIdentityCheck(db, deps, actor, recipient.id, { ktp: readFileSync(join(/* turbopackIgnore: true */ SPECIMEN_DIR, s.ktp)), face: readFileSync(join(/* turbopackIgnore: true */ SPECIMEN_DIR, s.face)) },
    { source: 'specimen', dryRun: hostedMode().demo, note: s.label, now });
}

/** Seed (db:seed / demo:reset): the three live recipients start verified, labelled as a seed. */
export function seedIdentity(db: Db, admin: Principal, secret: string, now: Date): string {
  const m = specimenManifest();
  let n = 0;
  for (const p of m.people) {
    const r = db.select().from(recipients).where(eq(recipients.nearAccountId, p.account)).get();
    if (!r) continue;
    const checks: CheckItem[] = [{ key: 'seed', label: 'Demo seed', status: 'pass', detail: 'Marked verified by the demo seed from the synthetic specimen in public/specimens/. No KTP was read and no face was compared: run a check to see the full pipeline.' }];
    record(db, {
      id: `idc_${randomUUID()}`, recipientId: r.id, actorUserId: admin.id, at: now, source: 'seed', dryRun: false, outcome: 'verified',
      nikMasked: maskNik(p.nik), nikHash: nikHash(p.nik, secret), faceScore: null, checks: JSON.stringify(checks), reader: null, faceEngine: null, note: null,
    }, true);
    n++;
  }
  setIdentityVerifiedOnly(db, admin, true, now);
  return `identity: ${n} testnet recipients seeded as verified (labelled demo seed), "Pay identity-verified recipients only" on`;
}

// ------------------------------------------------------------------ queries and the payout gate

export function latestChecks(db: Queryable, limit = 15): IdentityCheckView[] {
  return db.select({ id: identityChecks.id }).from(identityChecks).orderBy(desc(identityChecks.at), desc(sql`rowid`)).limit(limit).all().map((r) => view(db, r.id));
}

export function checksFor(db: Queryable, recipientId: string, limit = 10): IdentityCheckView[] {
  return db.select({ id: identityChecks.id }).from(identityChecks).where(eq(identityChecks.recipientId, recipientId)).orderBy(desc(identityChecks.at), desc(sql`rowid`)).limit(limit).all().map((r) => view(db, r.id));
}

export function identityStats(db: Queryable): Record<IdentityStatus, number> & { total: number } {
  const out = { unverified: 0, verified: 0, needs_review: 0, failed: 0, total: 0 };
  for (const r of db.select({ s: recipients.identityStatus, n: count() }).from(recipients).where(eq(recipients.active, true)).groupBy(recipients.identityStatus).all()) {
    out[r.s] = r.n;
    out.total += r.n;
  }
  return out;
}

/** Accounts → identity status, for frozen checks and the review page. */
export function identityByAccount(db: Queryable, accounts: string[]): Map<string, { name: string; status: IdentityStatus }> {
  const unique = [...new Set(accounts)];
  const out = new Map<string, { name: string; status: IdentityStatus }>();
  for (let i = 0; i < unique.length; i += 500) {
    for (const r of db.select({ a: recipients.nearAccountId, name: recipients.name, s: recipients.identityStatus }).from(recipients).where(inArray(recipients.nearAccountId, unique.slice(i, i + 500))).all()) {
      out.set(r.a, { name: r.name, status: r.s });
    }
  }
  return out;
}

export function unverifiedRows(db: Queryable, rows: { accountId: string }[]): { accountId: string; name: string | null }[] {
  const map = identityByAccount(db, rows.map((r) => r.accountId));
  return rows.filter((r) => map.get(r.accountId)?.status !== 'verified').map((r) => ({ accountId: r.accountId, name: map.get(r.accountId)?.name ?? null }));
}

/** Submit gate: with the setting on, every row must pay an identity-verified recipient. */
export function identitySubmitProblem(db: Queryable, rows: { accountId: string }[]): string | null {
  if (!identityVerifiedOnly(db)) return null;
  const bad = unverifiedRows(db, rows);
  if (!bad.length) return null;
  const names = [...new Set(bad.map((b) => b.name ?? b.accountId))];
  return `Pay identity-verified recipients only: ${bad.length.toLocaleString('en-US')} of ${rows.length.toLocaleString('en-US')} rows pay someone who has not passed the identity check (KTP + face)${names.length ? `: ${names.slice(0, 5).join(', ')}${names.length > 5 ? ', …' : ''}` : ''}. Nothing was sent. The admin verifies recipients on the Identity page.`;
}
