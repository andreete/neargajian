/**
 * The face check result carried by a Payroll Advance request (Phase 24), and the gate used at the
 * maker's submit and at the approval. Kept free of the face engine (no ONNX import), so the run
 * lifecycle and the worker stay light.
 */
import type { FaceTurnOrder } from '../db/schema.ts';
import { hostedMode, type Env } from '../hosted.ts';

export interface FaceCheckRecord {
  /** passed: the camera face matched. demo_override: public demo only, the face did not match but the head-turn check passed. */
  result: 'passed' | 'demo_override';
  similarity: number | null;
  threshold: number;
  order: FaceTurnOrder | null;
  /** ISO time (UTC) of the check. */
  at: string;
  attemptId: string;
  engine: string | null;
}

export const DEMO_OVERRIDE_LABEL = 'Face check: demo override (the camera face did not match; public demo only)';

export function parseFaceRecord(json: string | null): FaceCheckRecord | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as FaceCheckRecord;
    return v && (v.result === 'passed' || v.result === 'demo_override') ? v : null;
  } catch {
    return null;
  }
}

/** Maker submit and approval gate: null when the request carries an acceptable face check. */
export function faceCheckProblem(json: string | null, env: Env = process.env): string | null {
  const f = parseFaceRecord(json);
  if (!f) return 'This request has no passed face check (it was made before the camera face check existed). Decline it with a reason; the employee can request again.';
  if (f.result === 'passed') return null;
  return hostedMode(env).demo ? null : 'This request carries a public-demo face check override, which is not accepted outside the public demo. Decline it with a reason.';
}
