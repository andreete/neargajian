/**
 * Face templates (Phase 24): one per identity-verified recipient, used ONLY to confirm that
 * employee's own Payroll Advance requests with a live camera check.
 *
 * - The template is the SFace feature vector (128 numbers) of the verified face photo. Never the
 *   photo: the photo is processed in memory by the identity check and discarded.
 * - Encrypted at rest with AES-256-GCM. Key: FACE_TEMPLATE_KEY (32 random bytes, base64) from the
 *   server's environment; a fresh 12-byte IV per template; the recipient ID is bound in as
 *   associated data, so a template copied onto another recipient's row does not decrypt.
 * - Deleted when the recipient is deactivated or the identity check is reset (marked failed, or a
 *   new check that does not verify). Every creation and deletion is logged in face_template_events
 *   (append-only; IDs, the action and the reason only, no biometric data) and in audit_events.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Db, Queryable } from '../db/client.ts';
import { auditEvents, faceTemplateEvents, faceTemplates, recipients, type FaceTemplateSource, type FaceTemplateStatus } from '../db/schema.ts';

export type Env = Readonly<Record<string, string | undefined>>;
export const TEMPLATE_LENGTH = 128;
const VERSION = 'v1';

export class FaceKeyError extends Error {
  constructor(message: string) { super(message); this.name = 'FaceKeyError'; }
}

/** FACE_TEMPLATE_KEY as 32 bytes, or null when it is not set (templates are then off). */
export function faceTemplateKey(env: Env = process.env): Buffer | null {
  const raw = (env.FACE_TEMPLATE_KEY ?? '').trim();
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== raw.replace(/=+$/, '')) {
    throw new FaceKeyError('FACE_TEMPLATE_KEY must be 32 random bytes in base64 (node scripts/face-template-key.mjs writes one to .env).');
  }
  return key;
}

/** Non-secret fingerprint of the key (which key encrypted a template), never the key itself. */
export function keyId(key: Buffer): string {
  return createHmac('sha256', key).update('sentfund-face-template-key-id').digest('hex').slice(0, 16);
}

const aad = (recipientId: string) => Buffer.from(`sentfund-face-template:${VERSION}:${recipientId}`, 'utf8');

export function encryptTemplate(embedding: Float32Array, key: Buffer, recipientId: string): string {
  if (embedding.length !== TEMPLATE_LENGTH) throw new Error(`a face template has ${TEMPLATE_LENGTH} numbers`);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(recipientId));
  const plain = Buffer.alloc(TEMPLATE_LENGTH * 4);
  for (let i = 0; i < TEMPLATE_LENGTH; i++) plain.writeFloatLE(embedding[i]!, i * 4);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  plain.fill(0);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

/** Throws when the key is wrong, the blob was changed, or it belongs to another recipient. */
export function decryptTemplate(blob: string, key: Buffer, recipientId: string): Float32Array {
  const [v, iv, tag, ct] = blob.split('.');
  if (v !== VERSION || !iv || !tag || !ct) throw new Error('unknown face template format');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAAD(aad(recipientId));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const plain = Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]);
  if (plain.length !== TEMPLATE_LENGTH * 4) throw new Error('corrupt face template');
  const out = new Float32Array(TEMPLATE_LENGTH);
  for (let i = 0; i < TEMPLATE_LENGTH; i++) out[i] = plain.readFloatLE(i * 4);
  plain.fill(0);
  return out;
}

function logEvent(db: Queryable, e: { recipientId: string; action: typeof faceTemplateEvents.$inferInsert.action; reason: string; actorUserId: string | null; identityCheckId: string | null; at: Date }) {
  db.insert(faceTemplateEvents).values(e).run();
  db.insert(auditEvents).values({ at: e.at, actorUserId: e.actorUserId, action: `face_template.${e.action}`, entityType: 'recipient', entityId: e.recipientId, detail: JSON.stringify({ reason: e.reason, check: e.identityCheckId }) }).run();
}

/**
 * Stores (or replaces) a recipient's template. Call inside the transaction that records the
 * identity check. Returns false (nothing stored) when FACE_TEMPLATE_KEY is not set.
 */
export function storeTemplate(db: Queryable, input: {
  recipientId: string; embedding: Float32Array; status: FaceTemplateStatus; source: FaceTemplateSource; identityCheckId: string | null;
  engine: string; actorUserId: string | null; reason: string; now: Date; key?: Buffer | null;
}): boolean {
  const key = input.key === undefined ? faceTemplateKey() : input.key;
  if (!key) return false;
  const existing = db.select({ id: faceTemplates.recipientId }).from(faceTemplates).where(eq(faceTemplates.recipientId, input.recipientId)).get();
  const row = {
    recipientId: input.recipientId, ciphertext: encryptTemplate(input.embedding, key, input.recipientId), keyId: keyId(key), status: input.status,
    source: input.source, identityCheckId: input.identityCheckId, engine: input.engine, createdAt: input.now,
  };
  if (existing) db.update(faceTemplates).set(row).where(eq(faceTemplates.recipientId, input.recipientId)).run();
  else db.insert(faceTemplates).values(row).run();
  logEvent(db, { recipientId: input.recipientId, action: existing ? 'replaced' : 'created', reason: input.reason, actorUserId: input.actorUserId, identityCheckId: input.identityCheckId, at: input.now });
  return true;
}

/** A pending template becomes usable when the admin approves the check that waited for review. */
export function activateTemplate(db: Queryable, recipientId: string, input: { actorUserId: string; identityCheckId: string; now: Date }): boolean {
  const changed = db.update(faceTemplates).set({ status: 'active', identityCheckId: input.identityCheckId })
    .where(and(eq(faceTemplates.recipientId, recipientId), eq(faceTemplates.status, 'pending'))).run().changes;
  if (changed) logEvent(db, { recipientId, action: 'activated', reason: 'review_approved', actorUserId: input.actorUserId, identityCheckId: input.identityCheckId, at: input.now });
  return changed > 0;
}

/** Deletes the template, if any, and logs it. */
export function deleteTemplate(db: Queryable, recipientId: string, input: { reason: string; actorUserId: string | null; identityCheckId?: string | null; now: Date }): boolean {
  const changed = db.delete(faceTemplates).where(eq(faceTemplates.recipientId, recipientId)).run().changes;
  if (changed) logEvent(db, { recipientId, action: 'deleted', reason: input.reason, actorUserId: input.actorUserId, identityCheckId: input.identityCheckId ?? null, at: input.now });
  return changed > 0;
}

export type TemplateState =
  | { state: 'active'; embedding: Float32Array }
  | { state: 'none' | 'pending' | 'no_key' | 'unreadable' };

/** The recipient's usable template (decrypted in memory), or why there is none. */
export function templateFor(db: Queryable, recipientId: string, env: Env = process.env): TemplateState {
  const key = faceTemplateKey(env);
  if (!key) return { state: 'no_key' };
  const t = db.select().from(faceTemplates).where(eq(faceTemplates.recipientId, recipientId)).get();
  if (!t) return { state: 'none' };
  if (t.status !== 'active') return { state: 'pending' };
  if (t.keyId !== keyId(key)) return { state: 'unreadable' };
  try {
    return { state: 'active', embedding: decryptTemplate(t.ciphertext, key, recipientId) };
  } catch {
    return { state: 'unreadable' };
  }
}

/** For pages: is there a usable template (without decrypting it)? */
export function templateSummary(db: Queryable, recipientId: string, env: Env = process.env): 'active' | 'none' | 'pending' | 'no_key' | 'unreadable' {
  let key: Buffer | null;
  try { key = faceTemplateKey(env); } catch { return 'no_key'; }
  if (!key) return 'no_key';
  const t = db.select({ status: faceTemplates.status, keyId: faceTemplates.keyId }).from(faceTemplates).where(eq(faceTemplates.recipientId, recipientId)).get();
  if (!t) return 'none';
  if (t.status !== 'active') return 'pending';
  return t.keyId === keyId(key) ? 'active' : 'unreadable';
}

export const TEMPLATE_SUMMARY_LABEL: Record<ReturnType<typeof templateSummary>, string> = {
  active: 'Face template on file (encrypted)',
  pending: 'Face template waiting for the review',
  none: 'No face template',
  no_key: 'Face templates are off on this copy (FACE_TEMPLATE_KEY not set)',
  unreadable: 'Face template unreadable (the key changed): run the identity check again',
};

/** Recipient IDs that hold a template (admin identity page). */
export function templateRecipients(db: Queryable): Map<string, FaceTemplateStatus> {
  return new Map(db.select({ id: faceTemplates.recipientId, s: faceTemplates.status }).from(faceTemplates).all().map((r) => [r.id, r.s]));
}

/**
 * Demo seed (db:seed, demo:reset, every hosted start): the three demo employees get a template
 * computed from their committed SYNTHETIC specimen face photo (public/specimens/<name>-selfie.jpg),
 * when they are identity-verified and have no usable template yet. Needs the face models and
 * FACE_TEMPLATE_KEY; otherwise it says why and does nothing.
 */
export async function seedFaceTemplates(db: Db, people: { account: string; selfie: Buffer }[], engine: { id: string; analyze(b: Buffer): Promise<{ primary: { embedding: Float32Array } | null }> } | null, now: Date, env: Env = process.env): Promise<{ created: number; message: string }> {
  const key = faceTemplateKey(env);
  if (!key) return { created: 0, message: 'face templates: skipped (FACE_TEMPLATE_KEY not set)' };
  if (!engine) return { created: 0, message: 'face templates: skipped (face models missing; run npm run vision:models)' };
  let n = 0;
  for (const p of people) {
    const r = db.select({ id: recipients.id, status: recipients.identityStatus, active: recipients.active, check: recipients.identityCheckId }).from(recipients).where(eq(recipients.nearAccountId, p.account)).get();
    if (!r || r.status !== 'verified' || !r.active) continue;
    if (templateFor(db, r.id, env).state === 'active') continue;
    const a = await engine.analyze(p.selfie);
    if (!a.primary) continue;
    db.transaction((tx) => {
      storeTemplate(tx, { recipientId: r.id, embedding: a.primary!.embedding, status: 'active', source: 'seed', identityCheckId: r.check, engine: engine.id, actorUserId: null, reason: 'seed', now, key });
    }, { behavior: 'immediate' });
    n++;
  }
  return { created: n, message: `face templates: ${n} demo employee${n === 1 ? '' : 's'} (from the synthetic specimen face photos, encrypted)` };
}
