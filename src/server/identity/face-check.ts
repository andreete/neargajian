/**
 * Live camera face check at the Payroll Advance request (Phase 24): is the person asking for the
 * advance the employee whose identity the admin verified?
 *
 * 1. Challenge: the server issues a one-time challenge with a RANDOM turn order ("turn your head
 *    slowly to the left, then to the right", or the reverse) and a nonce valid for 60 seconds
 *    (only its SHA-256 is stored; it is used once).
 * 2. The browser sends a few small JPEG frames from the front camera with the nonce.
 * 3. The server checks, in memory only (YuNet + SFace, ./face.ts): exactly one face in every
 *    frame; the head turns in the requested order (yaw estimated from YuNet's landmarks); the same
 *    face from frame to frame; and the most frontal frame matches the employee's encrypted
 *    template (./face-template.ts) at or above OpenCV's SFace threshold 0.363. The frames are
 *    discarded (buffers zeroed) right after; only the result and the score are logged.
 * 4. A passed attempt can be used once, within 5 minutes, for that employee's own request
 *    (payroll_advances.face_attempt_id is unique). Public demo only (HOSTED_DEMO=true): after a
 *    failed MATCH with a passed head-turn check, "Continue as a demo" sends the request flagged
 *    demo_override; with HOSTED_DEMO off there is never an override.
 *
 * Limits, said plainly in the UI and docs: the head turn stops photos and replayed videos of the
 * wrong order; it is not certified liveness (presentation attack) detection.
 */
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, count, eq, gte } from 'drizzle-orm';
import type { Principal } from '../auth/policy.ts';
import type { Db, Queryable } from '../db/client.ts';
import {
  auditEvents, faceChallenges, faceCheckAttempts, payrollAdvances, recipients, users,
  type FaceCheckOutcome, type FaceTurnOrder,
} from '../db/schema.ts';
import { hostedMode, type Env } from '../hosted.ts';
import { DomainError } from '../runs/repository.ts';
import { SFACE_COSINE_THRESHOLD, cosine, decodeImage, type DetectedFace, type FaceEngine } from './face.ts';
import { templateFor, templateSummary } from './face-template.ts';
import type { FaceCheckRecord } from './face-record.ts';
export { DEMO_OVERRIDE_LABEL, faceCheckProblem, parseFaceRecord, type FaceCheckRecord } from './face-record.ts';

export const CHALLENGE_TTL_MS = 60_000;
/** A passed check must be used for the request within this time. */
export const PASS_VALID_MS = 5 * 60_000;
export const ATTEMPTS_PER_HOUR = 5;
export const CHALLENGES_PER_HOUR = 20;
export const MIN_FRAMES = 4;
export const MAX_FRAMES = 16;
export const MAX_FRAME_BYTES = 200 * 1024;
export const MAX_TOTAL_BYTES = MAX_FRAMES * MAX_FRAME_BYTES;
export const MAX_FRAME_SIDE = 1280;
/** |yaw| at or above this counts as a turn (about 12–15 degrees for an average face). */
export const TURN_YAW = 0.12;
/** Faces counted for "exactly one face" (the detector's lower threshold finds faint candidates). */
export const COUNTED_FACE_SCORE = 0.7;
export const MIN_FACE_WIDTH = 60;

export class FaceLimitError extends Error {
  constructor(message: string) { super(message); this.name = 'FaceLimitError'; }
}

// ------------------------------------------------------------------ pure parts (unit-tested)

/**
 * Yaw estimate from YuNet's five landmarks (right eye, left eye, nose tip, mouth corners; image
 * coordinates of the RAW, unmirrored camera frame): the nose tip's offset from the middle of the
 * eyes, measured along the eye line (so a tilted head does not count) and divided by the eye
 * distance. About 0 facing the camera. POSITIVE = the nose moved towards the person's own left
 * (image right), i.e. the head turned to the person's LEFT; negative = to their right.
 */
export function yawFromLandmarks(landmarks: readonly (readonly [number, number])[]): number {
  const [re, le, nose] = landmarks;
  if (!re || !le || !nose) return 0;
  const ex = le[0] - re[0], ey = le[1] - re[1];
  const d2 = ex * ex + ey * ey;
  if (d2 <= 0) return 0;
  const mx = (re[0] + le[0]) / 2, my = (re[1] + le[1]) / 2;
  return ((nose[0] - mx) * ex + (nose[1] - my) * ey) / d2;
}

export type Direction = 'left' | 'right' | 'center';

export function directionOf(yaw: number, threshold = TURN_YAW): Direction {
  return yaw >= threshold ? 'left' : yaw <= -threshold ? 'right' : 'center';
}

export const ORDER_STEPS: Record<FaceTurnOrder, readonly ['left' | 'right', 'left' | 'right']> = {
  left_right: ['left', 'right'], right_left: ['right', 'left'],
};

/** The first clear turn is in the first requested direction, and a later frame turns the other way. */
export function turnOrderOk(yaws: readonly number[], order: FaceTurnOrder, threshold = TURN_YAW): boolean {
  const [first, second] = ORDER_STEPS[order];
  const dirs = yaws.map((y) => directionOf(y, threshold));
  const i = dirs.findIndex((d) => d !== 'center');
  if (i < 0 || dirs[i] !== first) return false;
  return dirs.slice(i + 1).includes(second);
}

export function randomOrder(pick: (n: number) => number = randomInt): FaceTurnOrder {
  return pick(2) === 0 ? 'left_right' : 'right_left';
}

export interface FrameFaces {
  /** Faces at or above COUNTED_FACE_SCORE. */
  count: number;
  primary: { landmarks: [number, number][]; width: number; embedding: Float32Array } | null;
}

export interface FrameVerdict { outcome: FaceCheckOutcome; similarity: number | null; livenessPassed: boolean; yaws: number[] }

/** Liveness first (faces, head turn, same face throughout), then the match with the template. */
export function evaluateFrames(frames: readonly FrameFaces[], template: Float32Array, order: FaceTurnOrder, threshold = SFACE_COSINE_THRESHOLD): FrameVerdict {
  const fail = (outcome: FaceCheckOutcome, yaws: number[] = []): FrameVerdict => ({ outcome, similarity: null, livenessPassed: false, yaws });
  if (frames.length < MIN_FRAMES) return fail('bad_frames');
  if (frames.some((f) => !f.primary || f.primary.width < MIN_FACE_WIDTH)) return fail('no_face');
  if (frames.some((f) => f.count > 1)) return fail('multiple_faces');
  const faces = frames.map((f) => f.primary!);
  const yaws = faces.map((f) => yawFromLandmarks(f.landmarks));
  if (!turnOrderOk(yaws, order)) return fail('turn', yaws);
  // The same face from frame to frame (consecutive frames differ little in pose).
  for (let i = 1; i < faces.length; i++) if (cosine(faces[i - 1]!.embedding, faces[i]!.embedding) < threshold) return fail('changed_face', yaws);
  let frontal = 0;
  for (let i = 1; i < yaws.length; i++) if (Math.abs(yaws[i]!) < Math.abs(yaws[frontal]!)) frontal = i;
  const similarity = cosine(faces[frontal]!.embedding, template);
  return { outcome: similarity >= threshold ? 'passed' : 'mismatch', similarity, livenessPassed: true, yaws };
}

export function faceCheckMessage(outcome: FaceCheckOutcome, name: string, order: FaceTurnOrder | null): string {
  const [first, second] = ORDER_STEPS[order ?? 'left_right'];
  switch (outcome) {
    case 'passed': return `Face verified: it's you, ${name}.`;
    case 'mismatch': return `This doesn't look like ${name}.`;
    case 'no_face': return 'No face found. Keep your whole face in the frame, in good light, and try again.';
    case 'multiple_faces': return 'More than one face. Make sure only you are in view, then try again.';
    case 'turn': return `Please turn your head as asked: slowly to the ${first}, then to the ${second}.`;
    case 'changed_face': return 'The face changed during the check. Make sure only you are in view, then try again.';
    case 'no_template': return 'Ask your admin to verify your identity first.';
    case 'challenge_invalid': return 'The check expired (60 seconds) or was already used. Start it again.';
    case 'bad_frames': return 'The camera frames could not be read. Start the check again.';
  }
}

export const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

export { cameraStandIn } from '../hosted.ts';

// ------------------------------------------------------------------ challenge, attempt, claim

function employeeRecipient(db: Queryable, principal: Principal) {
  if (principal.role !== 'employee') throw new DomainError('forbidden', 'Only employees verify themselves for a Payroll Advance.');
  const u = db.select({ recipientId: users.recipientId }).from(users).where(eq(users.id, principal.id)).get();
  const r = u?.recipientId ? db.select().from(recipients).where(eq(recipients.id, u.recipientId)).get() : undefined;
  if (!r) throw new DomainError('not_found', 'Your login is not linked to a recipient. Ask the admin.');
  return r;
}

export const NO_KEY_MESSAGE = 'The face check is not set up on this copy (FACE_TEMPLATE_KEY is missing). Ask your admin.';

/** Why this employee cannot start a face check now (null: they can). */
export function faceCheckBlocker(db: Queryable, recipientId: string, env: Env = process.env): string | null {
  const s = templateSummary(db, recipientId, env);
  if (s === 'active') return null;
  if (s === 'no_key') return NO_KEY_MESSAGE;
  return s === 'unreadable' ? 'Ask your admin to verify your identity first (your face template must be created again).' : 'Ask your admin to verify your identity first.';
}

function attemptsInLastHour(db: Queryable, userId: string, now: Date): number {
  return db.select({ n: count() }).from(faceCheckAttempts).where(and(eq(faceCheckAttempts.userId, userId), gte(faceCheckAttempts.at, new Date(now.getTime() - 3_600_000)))).get()?.n ?? 0;
}

function assertAttemptsLeft(db: Queryable, userId: string, now: Date) {
  if (attemptsInLastHour(db, userId, now) >= ATTEMPTS_PER_HOUR) {
    throw new FaceLimitError(`You tried the face check ${ATTEMPTS_PER_HOUR} times in the last hour, the limit. Try again later.`);
  }
}

export interface Challenge { challengeId: string; nonce: string; order: FaceTurnOrder; expiresAt: string; steps: readonly ['left' | 'right', 'left' | 'right'] }

export function issueChallenge(db: Db, principal: Principal, now = new Date(), opts: { env?: Env; pick?: (n: number) => number } = {}): Challenge {
  const r = employeeRecipient(db, principal);
  const blocker = faceCheckBlocker(db, r.id, opts.env);
  if (blocker) throw new DomainError('conflict', blocker);
  assertAttemptsLeft(db, principal.id, now);
  const issued = db.select({ n: count() }).from(faceChallenges).where(and(eq(faceChallenges.userId, principal.id), gte(faceChallenges.issuedAt, new Date(now.getTime() - 3_600_000)))).get()?.n ?? 0;
  if (issued >= CHALLENGES_PER_HOUR) throw new FaceLimitError(`You started the face check ${CHALLENGES_PER_HOUR} times in the last hour, the limit. Try again later.`);
  const order = randomOrder(opts.pick);
  const nonce = randomBytes(24).toString('base64url');
  const id = `fch_${randomUUID()}`;
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
  db.insert(faceChallenges).values({ id, userId: principal.id, recipientId: r.id, nonceHash: sha256(nonce), turnOrder: order, issuedAt: now, expiresAt }).run();
  return { challengeId: id, nonce, order, expiresAt: expiresAt.toISOString(), steps: ORDER_STEPS[order] };
}

/**
 * Marks the challenge used (whatever happens next) and says whether it was valid: this user's,
 * not used before, not expired, and the nonce matches.
 */
export function consumeChallenge(db: Db, userId: string, challengeId: unknown, nonce: unknown, now: Date): { ok: true; order: FaceTurnOrder } | { ok: false; order: FaceTurnOrder | null } {
  if (typeof challengeId !== 'string' || typeof nonce !== 'string' || challengeId.length > 80 || nonce.length > 100) return { ok: false, order: null };
  return db.transaction((tx) => {
    const c = tx.select().from(faceChallenges).where(eq(faceChallenges.id, challengeId)).get();
    if (!c || c.userId !== userId) return { ok: false as const, order: null };
    if (c.usedAt) return { ok: false as const, order: c.turnOrder };
    tx.update(faceChallenges).set({ usedAt: now }).where(eq(faceChallenges.id, c.id)).run();
    const given = Buffer.from(sha256(nonce), 'hex'), stored = Buffer.from(c.nonceHash, 'hex');
    const match = given.length === stored.length && timingSafeEqual(given, stored);
    if (!match || c.expiresAt.getTime() <= now.getTime()) return { ok: false as const, order: c.turnOrder };
    return { ok: true as const, order: c.turnOrder };
  }, { behavior: 'immediate' });
}

/** JPEG only (the browser encodes the frames with canvas.toBlob('image/jpeg')). */
export function looksLikeJpeg(b: Buffer): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

export function framesProblem(frames: readonly Buffer[]): string | null {
  if (frames.length < MIN_FRAMES || frames.length > MAX_FRAMES) return `Send ${MIN_FRAMES} to ${MAX_FRAMES} frames.`;
  let total = 0;
  for (const f of frames) {
    if (!looksLikeJpeg(f)) return 'Every frame must be a JPEG image.';
    if (f.length > MAX_FRAME_BYTES) return `Each frame must be ${MAX_FRAME_BYTES / 1024} KB or smaller.`;
    total += f.length;
  }
  return total > MAX_TOTAL_BYTES ? 'The frames are too large in total.' : null;
}

async function analyzeFrame(engine: FaceEngine, bytes: Buffer): Promise<FrameFaces | null> {
  let img;
  try { img = await decodeImage(bytes); } catch { return null; }
  try {
    if (img.width > MAX_FRAME_SIDE || img.height > MAX_FRAME_SIDE) return null;
    const a = await engine.analyzeImage(img);
    const counted = a.faces.filter((f: DetectedFace) => f.score >= COUNTED_FACE_SCORE).length;
    return { count: Math.max(counted, a.primary ? 1 : 0), primary: a.primary ? { landmarks: a.primary.face.landmarks, width: a.primary.face.box.w, embedding: a.primary.embedding } : null };
  } finally {
    img.data.fill(0); // the decoded pixels are discarded
  }
}

export interface AttemptView {
  attemptId: string; outcome: FaceCheckOutcome; passed: boolean; similarity: number | null; threshold: number; livenessPassed: boolean;
  order: FaceTurnOrder | null; message: string; overrideAvailable: boolean; attemptsLeft: number;
}

function recordAttempt(db: Db, row: typeof faceCheckAttempts.$inferInsert) {
  db.transaction((tx) => {
    tx.insert(faceCheckAttempts).values(row).run();
    tx.insert(auditEvents).values({ at: row.at, actorUserId: row.userId, action: 'face_check.attempt', entityType: 'recipient', entityId: row.recipientId, detail: JSON.stringify({ attempt: row.id, outcome: row.outcome, similarity: row.similarity === null || row.similarity === undefined ? null : Number(row.similarity.toFixed(3)) }) }).run();
  }, { behavior: 'immediate' });
}

/**
 * One attempt: the challenge is consumed, the frames are analysed in memory and discarded, the
 * result and the score are logged. Never stores an image.
 */
export async function runFaceCheck(db: Db, engine: FaceEngine | null, principal: Principal, input: { challengeId: unknown; nonce: unknown; frames: Buffer[] }, now = new Date(), env: Env = process.env): Promise<AttemptView> {
  const r = employeeRecipient(db, principal);
  try {
    if (!engine) throw new DomainError('conflict', 'The face check is off on this copy: the face models are missing (npm run vision:models).');
    assertAttemptsLeft(db, principal.id, now);
    const challenge = consumeChallenge(db, principal.id, input.challengeId, input.nonce, now);
    const id = `fca_${randomUUID()}`;
    let verdict: FrameVerdict = { outcome: 'challenge_invalid', similarity: null, livenessPassed: false, yaws: [] };
    if (challenge.ok) {
      const tpl = templateFor(db, r.id, env);
      if (tpl.state !== 'active') verdict = { ...verdict, outcome: 'no_template' };
      else if (framesProblem(input.frames)) verdict = { ...verdict, outcome: 'bad_frames' };
      else {
        const analysed: FrameFaces[] = [];
        let unreadable = false;
        for (const f of input.frames) {
          const a = await analyzeFrame(engine, f);
          if (!a) { unreadable = true; break; }
          analysed.push(a);
        }
        verdict = unreadable ? { ...verdict, outcome: 'bad_frames' } : evaluateFrames(analysed, tpl.embedding, challenge.order);
        tpl.embedding.fill(0);
      }
    }
    recordAttempt(db, {
      id, userId: principal.id, recipientId: r.id, challengeId: typeof input.challengeId === 'string' ? input.challengeId.slice(0, 80) : null, at: now,
      outcome: verdict.outcome, similarity: verdict.similarity, turnOrder: challenge.order, livenessPassed: verdict.livenessPassed, frames: input.frames.length, engine: engine.id,
    });
    const passed = verdict.outcome === 'passed';
    return {
      attemptId: id, outcome: verdict.outcome, passed, similarity: verdict.similarity, threshold: SFACE_COSINE_THRESHOLD, livenessPassed: verdict.livenessPassed,
      order: challenge.order, message: faceCheckMessage(verdict.outcome, r.name, challenge.order),
      overrideAvailable: hostedMode(env).demo && verdict.outcome === 'mismatch' && verdict.livenessPassed,
      attemptsLeft: Math.max(0, ATTEMPTS_PER_HOUR - attemptsInLastHour(db, principal.id, now)),
    };
  } finally {
    for (const f of input.frames) f.fill(0); // the frames are discarded
  }
}

// ------------------------------------------------------------------ the result carried by the request

export const FACE_REQUIRED_MESSAGE = "Verify it's you with the camera first: a Payroll Advance request needs a passed face check.";

/**
 * Inside the request's transaction: the attempt must be this employee's, at most 5 minutes old, not
 * used before, and passed; or, in the public demo only, a mismatch with a passed head-turn check
 * when the employee chose "Continue as a demo".
 */
export function claimFaceCheck(db: Queryable, principal: Principal, recipientId: string, attemptId: unknown, demoOverride: unknown, now: Date, env: Env = process.env): FaceCheckRecord {
  if (typeof attemptId !== 'string' || !attemptId || attemptId.length > 80) throw new DomainError('invalid', FACE_REQUIRED_MESSAGE);
  const a = db.select().from(faceCheckAttempts).where(eq(faceCheckAttempts.id, attemptId)).get();
  if (!a || a.userId !== principal.id || a.recipientId !== recipientId) throw new DomainError('invalid', FACE_REQUIRED_MESSAGE);
  if (now.getTime() - a.at.getTime() > PASS_VALID_MS) throw new DomainError('invalid', "The face check is older than 5 minutes. Verify it's you again.");
  if (db.select({ id: payrollAdvances.id }).from(payrollAdvances).where(eq(payrollAdvances.faceAttemptId, a.id)).get()) {
    throw new DomainError('conflict', "This face check was already used for a request. Verify it's you again.");
  }
  const base = { similarity: a.similarity, threshold: SFACE_COSINE_THRESHOLD, order: a.turnOrder, at: a.at.toISOString(), attemptId: a.id, engine: a.engine };
  if (a.outcome === 'passed') return { result: 'passed', ...base };
  if (demoOverride === true) {
    if (!hostedMode(env).demo) throw new DomainError('invalid', 'There is no demo override outside the public demo: a face that does not match is refused.');
    if (a.outcome !== 'mismatch' || !a.livenessPassed) throw new DomainError('invalid', 'The demo override needs a real, moving face: the head-turn check must pass first.');
    return { result: 'demo_override', ...base };
  }
  const name = db.select({ name: recipients.name }).from(recipients).where(eq(recipients.id, recipientId)).get()?.name ?? 'you';
  throw new DomainError('invalid', `The face check did not pass: ${faceCheckMessage(a.outcome, name, a.turnOrder)}`);
}
