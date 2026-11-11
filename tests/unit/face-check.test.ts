/**
 * Phase 24 · the camera face check's rules, without the face models: yaw from landmarks, the turn
 * order, the frame verdict (threshold 0.363 at the edge), the challenge (random order, nonce valid
 * 60 s and used once), the attempt limit, the frame limits, and the template encryption.
 */
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDatabase, type DatabaseHandle } from '@/server/db/client';
import { seedDemo } from '@/server/db/seed';
import { faceChallenges, faceCheckAttempts, recipients } from '@/server/db/schema';
import {
  ATTEMPTS_PER_HOUR, CHALLENGE_TTL_MS, consumeChallenge, directionOf, evaluateFrames, FaceLimitError, faceCheckMessage, framesProblem, issueChallenge,
  MAX_FRAME_BYTES, randomOrder, runFaceCheck, turnOrderOk, TURN_YAW, yawFromLandmarks, type FrameFaces,
} from '@/server/identity/face-check';
import { decryptTemplate, encryptTemplate, faceTemplateKey, keyId, storeTemplate, templateFor } from '@/server/identity/face-template';
import { faceCheckProblem } from '@/server/identity/face-record';
import type { FaceEngine } from '@/server/identity/face';

// ------------------------------------------------------------------ geometry

/** Landmarks of a face looking at the camera, with the nose moved sideways by `nose` px. */
const face = (nose = 0, roll = 0): [number, number][] => {
  const pts: [number, number][] = [[-30, -20], [30, -20], [nose, 10], [-20, 35], [20, 35]];
  const c = Math.cos(roll), s = Math.sin(roll);
  return pts.map(([x, y]) => [200 + x * c - y * s, 200 + x * s + y * c]);
};

describe('yaw from the YuNet landmarks', () => {
  it('is 0 facing the camera, positive when the nose moves to the image right (the person turned to their LEFT), negative the other way', () => {
    expect(yawFromLandmarks(face(0))).toBeCloseTo(0, 6);
    expect(yawFromLandmarks(face(12))).toBeCloseTo(0.2, 6); // 12 px over a 60 px eye distance
    expect(yawFromLandmarks(face(-12))).toBeCloseTo(-0.2, 6);
  });
  it('ignores a tilted head (measured along the eye line)', () => {
    expect(yawFromLandmarks(face(0, 0.4))).toBeCloseTo(0, 6);
    expect(yawFromLandmarks(face(12, 0.4))).toBeCloseTo(0.2, 6);
  });
  it('classifies a turn at the threshold', () => {
    expect(TURN_YAW).toBe(0.12);
    expect(directionOf(0.12)).toBe('left');
    expect(directionOf(0.1199)).toBe('center');
    expect(directionOf(-0.12)).toBe('right');
    expect(yawFromLandmarks([])).toBe(0);
  });
});

describe('the challenge order', () => {
  it('needs the first clear turn in the first direction, then a later turn the other way', () => {
    expect(turnOrderOk([0, 0, 0.2, 0.25, 0, -0.2, -0.3], 'left_right')).toBe(true);
    expect(turnOrderOk([0, -0.2, 0.2], 'left_right')).toBe(false); // started the wrong way
    expect(turnOrderOk([0, 0.2, 0.2], 'left_right')).toBe(false); // never turned back
    expect(turnOrderOk([0, 0, 0, 0], 'left_right')).toBe(false); // a still photo
    expect(turnOrderOk([0, -0.2, -0.2, 0.3], 'right_left')).toBe(true);
    expect(turnOrderOk([0, 0.2, -0.3], 'right_left')).toBe(false);
  });
  it('is random: both orders occur', () => {
    expect(randomOrder(() => 0)).toBe('left_right');
    expect(randomOrder(() => 1)).toBe('right_left');
    const seen = new Set(Array.from({ length: 64 }, () => randomOrder()));
    expect(seen).toEqual(new Set(['left_right', 'right_left']));
  });
  it('has the messages the employee sees', () => {
    expect(faceCheckMessage('mismatch', 'Emma Clark', 'left_right')).toBe("This doesn't look like Emma Clark.");
    expect(faceCheckMessage('turn', 'Emma Clark', 'right_left')).toBe('Please turn your head as asked: slowly to the right, then to the left.');
    expect(faceCheckMessage('multiple_faces', 'x', null)).toMatch(/^More than one face/);
    expect(faceCheckMessage('no_face', 'x', null)).toMatch(/^No face found/);
    expect(faceCheckMessage('no_template', 'x', null)).toBe('Ask your admin to verify your identity first.');
  });
});

// ------------------------------------------------------------------ the verdict on analysed frames

/** A unit vector at `angle` in the first two dimensions: cosine(a, b) = cos(angle difference). */
const vec = (angle: number) => { const v = new Float32Array(128); v[0] = Math.cos(angle); v[1] = Math.sin(angle); return v; };
const frame = (yaw: number, emb = vec(0), count = 1, width = 200): FrameFaces => ({ count, primary: { landmarks: face(yaw * 60), width, embedding: emb } });
const turning = (emb = vec(0)) => [frame(0, emb), frame(0, emb), frame(0.2, emb), frame(0.25, emb), frame(-0.2, emb), frame(-0.25, emb)];

describe('evaluateFrames: liveness first, then the match at 0.363', () => {
  it('passes a turning face that matches the template', () => {
    const v = evaluateFrames(turning(), vec(0), 'left_right');
    expect(v).toMatchObject({ outcome: 'passed', livenessPassed: true });
    expect(v.similarity!).toBeCloseTo(1, 5);
  });
  it('mismatch: liveness passed, but another face', () => {
    expect(evaluateFrames(turning(), vec(Math.PI / 2), 'left_right')).toMatchObject({ outcome: 'mismatch', livenessPassed: true });
  });
  it('the threshold: 0.363 is a match, just below is not', () => {
    const at = Math.acos(0.363 + 1e-7), below = Math.acos(0.3629);
    expect(evaluateFrames(turning(), vec(at), 'left_right').outcome).toBe('passed');
    expect(evaluateFrames(turning(), vec(below), 'left_right').outcome).toBe('mismatch');
  });
  it('no face, a tiny face, more than one face, the wrong order, a still photo, a face that changes', () => {
    const f = turning();
    expect(evaluateFrames([...f.slice(0, 5), { count: 0, primary: null }], vec(0), 'left_right').outcome).toBe('no_face');
    expect(evaluateFrames([...f.slice(0, 5), frame(0, vec(0), 1, 40)], vec(0), 'left_right').outcome).toBe('no_face');
    expect(evaluateFrames([...f.slice(0, 5), frame(-0.2, vec(0), 2)], vec(0), 'left_right').outcome).toBe('multiple_faces');
    expect(evaluateFrames(f, vec(0), 'right_left')).toMatchObject({ outcome: 'turn', livenessPassed: false, similarity: null });
    expect(evaluateFrames([frame(0), frame(0), frame(0), frame(0)], vec(0), 'left_right').outcome).toBe('turn');
    const swapped = [frame(0), frame(0), frame(0.2), frame(0.2, vec(Math.PI / 2)), frame(-0.2, vec(Math.PI / 2))];
    expect(evaluateFrames(swapped, vec(0), 'left_right').outcome).toBe('changed_face');
    expect(evaluateFrames(f.slice(0, 3), vec(0), 'left_right').outcome).toBe('bad_frames');
  });
});

describe('frame limits', () => {
  const jpeg = (n = 1000) => { const b = Buffer.alloc(n); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; return b; };
  it('4 to 16 JPEG frames of at most 200 KB each', () => {
    expect(framesProblem([jpeg(), jpeg(), jpeg(), jpeg()])).toBeNull();
    expect(framesProblem([jpeg(), jpeg(), jpeg()])).toMatch(/4 to 16/);
    expect(framesProblem(Array.from({ length: 17 }, () => jpeg()))).toMatch(/4 to 16/);
    expect(framesProblem([jpeg(), jpeg(), jpeg(), Buffer.from('PNG...')])).toMatch(/JPEG/);
    expect(framesProblem([jpeg(), jpeg(), jpeg(), jpeg(MAX_FRAME_BYTES + 1)])).toMatch(/200 KB/);
  });
});

// ------------------------------------------------------------------ template encryption

describe('face template encryption (AES-256-GCM, bound to the recipient)', () => {
  const key = randomBytes(32);
  const emb = Float32Array.from({ length: 128 }, (_, i) => Math.sin(i) / 8);
  it('round-trips, and never contains the plain numbers', () => {
    const blob = encryptTemplate(emb, key, 'rcp_1');
    expect(blob).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(Array.from(decryptTemplate(blob, key, 'rcp_1'))).toEqual(Array.from(emb));
    const plain = Buffer.alloc(512); emb.forEach((x, i) => plain.writeFloatLE(x, i * 4));
    expect(Buffer.from(blob.split('.')[3]!, 'base64url').equals(plain)).toBe(false);
    expect(encryptTemplate(emb, key, 'rcp_1')).not.toBe(blob); // a fresh IV every time
  });
  it('fails with another key, another recipient, or a changed byte', () => {
    const blob = encryptTemplate(emb, key, 'rcp_1');
    expect(() => decryptTemplate(blob, randomBytes(32), 'rcp_1')).toThrow();
    expect(() => decryptTemplate(blob, key, 'rcp_2')).toThrow();
    const parts = blob.split('.'); const ct = Buffer.from(parts[3]!, 'base64url'); ct[0]! ^= 1;
    expect(() => decryptTemplate([parts[0], parts[1], parts[2], ct.toString('base64url')].join('.'), key, 'rcp_1')).toThrow();
  });
  it('FACE_TEMPLATE_KEY must be 32 bytes in base64; unset turns templates off', () => {
    expect(faceTemplateKey({})).toBeNull();
    expect(faceTemplateKey({ FACE_TEMPLATE_KEY: key.toString('base64') })!.equals(key)).toBe(true);
    expect(() => faceTemplateKey({ FACE_TEMPLATE_KEY: 'short' })).toThrow(/32 random bytes/);
    expect(() => faceTemplateKey({ FACE_TEMPLATE_KEY: randomBytes(16).toString('base64') })).toThrow(/32 random bytes/);
    expect(keyId(key)).toMatch(/^[0-9a-f]{16}$/);
    expect(keyId(key)).not.toContain(key.toString('hex').slice(0, 8));
  });
});

// ------------------------------------------------------------------ challenge, nonce, attempts (database)

const dir = mkdtempSync(join(tmpdir(), 'sentfund-fc-'));
afterAll(() => { rmSync(dir, { recursive: true, force: true }); delete process.env.FACE_TEMPLATE_KEY; });
const emma = { id: 'usr_emp_emma', role: 'employee' as const };
const NOW = new Date('2026-11-11T09:00:00Z');
const KEY = randomBytes(32).toString('base64');
let h: DatabaseHandle;
let n = 0;
/** A face engine that is never reached: every frame here is refused before analysis. */
const noEngine = { id: 'unused', analyze: () => { throw new Error('no'); }, analyzeImage: () => { throw new Error('no'); }, detect: () => { throw new Error('no'); } } as unknown as FaceEngine;

beforeEach(async () => {
  n += 1;
  h = openDatabase(join(dir, `f${n}.sqlite`));
  delete process.env.FACE_TEMPLATE_KEY; // no seeded templates here: only Emma's test template below
  await seedDemo(h.db, { env: { DEMO_MODE: 'true' }, now: NOW, recipientDirectory: true, testnetHistory: false, demoDraft: false });
  process.env.FACE_TEMPLATE_KEY = KEY;
  const r = h.db.select().from(recipients).where(eq(recipients.nearAccountId, 'recipient1.sentfund-payroll.testnet')).get()!;
  storeTemplate(h.db, { recipientId: r.id, embedding: vec(0), status: 'active', source: 'seed', identityCheckId: null, engine: 'test', actorUserId: null, reason: 'seed', now: NOW });
});

describe('the one-time challenge', () => {
  it('stores only the nonce hash; the nonce is valid for 60 seconds and works once', () => {
    const c = issueChallenge(h.db, emma, NOW);
    expect(new Date(c.expiresAt).getTime() - NOW.getTime()).toBe(CHALLENGE_TTL_MS);
    const row = h.db.select().from(faceChallenges).where(eq(faceChallenges.id, c.challengeId)).get()!;
    expect(row.nonceHash).not.toContain(c.nonce);
    expect(consumeChallenge(h.db, emma.id, c.challengeId, c.nonce, new Date(NOW.getTime() + 59_000))).toEqual({ ok: true, order: c.order });
    expect(consumeChallenge(h.db, emma.id, c.challengeId, c.nonce, new Date(NOW.getTime() + 59_500)).ok).toBe(false); // used once
  });
  it('is refused after 60 seconds, with a wrong nonce, or for another user; a refused try still uses it up', () => {
    const late = issueChallenge(h.db, emma, NOW);
    expect(consumeChallenge(h.db, emma.id, late.challengeId, late.nonce, new Date(NOW.getTime() + CHALLENGE_TTL_MS)).ok).toBe(false);
    const wrong = issueChallenge(h.db, emma, NOW);
    expect(consumeChallenge(h.db, emma.id, wrong.challengeId, 'guess', NOW).ok).toBe(false);
    expect(consumeChallenge(h.db, emma.id, wrong.challengeId, wrong.nonce, NOW).ok).toBe(false);
    const other = issueChallenge(h.db, emma, NOW);
    expect(consumeChallenge(h.db, 'usr_emp_daniel', other.challengeId, other.nonce, NOW).ok).toBe(false);
    expect(consumeChallenge(h.db, emma.id, other.challengeId, other.nonce, NOW).ok).toBe(true); // Daniel's try did not use Emma's
    expect(() => h.db.update(faceChallenges).set({ usedAt: null }).where(eq(faceChallenges.id, other.challengeId)).run()).toThrow(/used once/);
  });
  it('without a template: "Ask your admin to verify your identity first"', () => {
    expect(() => issueChallenge(h.db, { id: 'usr_emp_daniel', role: 'employee' }, NOW)).toThrow('Ask your admin to verify your identity first.');
    delete process.env.FACE_TEMPLATE_KEY;
    expect(() => issueChallenge(h.db, emma, NOW)).toThrow(/FACE_TEMPLATE_KEY is missing/);
    process.env.FACE_TEMPLATE_KEY = randomBytes(32).toString('base64'); // another key: the stored template is unreadable
    expect(templateFor(h.db, h.db.select().from(recipients).where(eq(recipients.nearAccountId, 'recipient1.sentfund-payroll.testnet')).get()!.id).state).toBe('unreadable');
    expect(() => issueChallenge(h.db, emma, NOW)).toThrow(/verify your identity first/);
  });
  it('only an employee', () => {
    expect(() => issueChallenge(h.db, { id: 'usr_maker', role: 'maker' }, NOW)).toThrow(/Only employees/);
  });
});

describe('attempts: logged with the result and the score only, at most 5 an hour', () => {
  it('every attempt is logged; the 6th within an hour is refused, and so is a new challenge', async () => {
    for (let i = 0; i < ATTEMPTS_PER_HOUR; i++) {
      const c = issueChallenge(h.db, emma, new Date(NOW.getTime() + i * 1000));
      const a = await runFaceCheck(h.db, noEngine, emma, { challengeId: c.challengeId, nonce: c.nonce, frames: [Buffer.from('x')] }, new Date(NOW.getTime() + i * 1000 + 10));
      expect(a).toMatchObject({ outcome: 'bad_frames', passed: false, attemptsLeft: ATTEMPTS_PER_HOUR - i - 1 });
    }
    const rows = h.db.select().from(faceCheckAttempts).all();
    expect(rows).toHaveLength(ATTEMPTS_PER_HOUR);
    expect(Object.keys(rows[0]!).sort()).toEqual(['at', 'challengeId', 'engine', 'frames', 'id', 'livenessPassed', 'outcome', 'recipientId', 'similarity', 'turnOrder', 'userId']);
    expect(() => issueChallenge(h.db, emma, new Date(NOW.getTime() + 60_000))).toThrow(FaceLimitError);
    await expect(runFaceCheck(h.db, noEngine, emma, { challengeId: 'x', nonce: 'y', frames: [] }, new Date(NOW.getTime() + 60_000))).rejects.toThrow(/5 times in the last hour/);
    expect(() => issueChallenge(h.db, emma, new Date(NOW.getTime() + 3_600_000 + 5000))).not.toThrow(); // an hour later
    expect(() => h.db.delete(faceCheckAttempts).run()).toThrow(/append-only/);
  });
  it('an expired or reused challenge is logged as challenge_invalid; the frames are zeroed afterwards', async () => {
    const c = issueChallenge(h.db, emma, NOW);
    const frames = [Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3])];
    const a = await runFaceCheck(h.db, noEngine, emma, { challengeId: c.challengeId, nonce: c.nonce, frames }, new Date(NOW.getTime() + 61_000));
    expect(a.outcome).toBe('challenge_invalid');
    expect(a.message).toMatch(/expired \(60 seconds\)/);
    expect(frames[0]!.every((b) => b === 0)).toBe(true);
  });
});

describe('the gate at the maker submit and the approval', () => {
  const rec = (result: string) => JSON.stringify({ result, similarity: 0.2, threshold: 0.363, order: 'left_right', at: NOW.toISOString(), attemptId: 'a', engine: 'e' });
  it('passed is accepted; the demo override only with HOSTED_DEMO=true; nothing at all never', () => {
    expect(faceCheckProblem(rec('passed'), {})).toBeNull();
    expect(faceCheckProblem(rec('demo_override'), { HOSTED_DEMO: 'true' })).toBeNull();
    expect(faceCheckProblem(rec('demo_override'), {})).toMatch(/not accepted outside the public demo/);
    expect(faceCheckProblem(null, { HOSTED_DEMO: 'true' })).toMatch(/no passed face check/);
    expect(faceCheckProblem('{"result":"whatever"}', { HOSTED_DEMO: 'true' })).toMatch(/no passed face check/);
  });
});
