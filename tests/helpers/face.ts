/**
 * TEST FIXTURE (Phase 24): a recorded camera face check attempt, as if the employee had just passed
 * the live check (tests/integration/face-check.test.ts runs the real check on the specimen frames).
 * Lets the Payroll Advance tests focus on the money rules.
 */
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '@/server/db/client';
import { faceCheckAttempts, users, type FaceCheckOutcome } from '@/server/db/schema';
import { requestAdvance as realRequestAdvance, type AdvanceRequestInput } from '@/server/advance/service';
import type { Principal } from '@/server/auth/policy';

export function recordedFaceAttempt(db: Db, principal: Principal, now: Date, outcome: FaceCheckOutcome = 'passed', opts: { similarity?: number; livenessPassed?: boolean } = {}): string {
  const recipientId = db.select({ r: users.recipientId }).from(users).where(eq(users.id, principal.id)).get()?.r;
  if (!recipientId) return 'fca_none';
  const id = `fca_test_${randomUUID()}`;
  db.insert(faceCheckAttempts).values({
    id, userId: principal.id, recipientId, challengeId: null, at: now, outcome,
    similarity: opts.similarity ?? (outcome === 'passed' ? 0.91 : outcome === 'mismatch' ? 0.12 : null),
    turnOrder: 'left_right', livenessPassed: opts.livenessPassed ?? (outcome === 'passed' || outcome === 'mismatch'), frames: 14, engine: 'test fixture',
  }).run();
  return id;
}

/** requestAdvance with a freshly recorded passed face check (unless the input names one). */
export function requestAdvanceFaced(db: Db, principal: Principal, input: AdvanceRequestInput, now = new Date()) {
  return realRequestAdvance(db, principal, { faceAttemptId: recordedFaceAttempt(db, principal, now), ...input }, now);
}
