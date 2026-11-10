/**
 * Phase 21 · identity check, pure parts: NIK structure and card agreement, masking and the keyed
 * hash, name matching, YuNet output decoding, NMS, the alignment transform and the decision.
 */
import { describe, expect, it } from 'vitest';
import { alignFace, cosine, decodeYunet, iou, nms, similarityTransform, type DetectedFace, type FaceAnalysis } from '@/server/identity/face';
import { compareNames, maskNik, nikHash, nikMatchesCard, parseNik } from '@/server/identity/nik';
import { evaluate } from '@/server/identity/service';
import type { KtpReading } from '@/server/identity/ktp-reader';

describe('NIK', () => {
  it('accepts a well-formed NIK and decodes province, date and sex (women: day + 40)', () => {
    const r = parseNik('3174 9952 0394 0001');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nik).toBe('3174995203940001');
    expect(r.parts).toMatchObject({ province: '31', provinceName: 'DKI Jakarta', regency: '74', district: '99', birthDay: 12, birthMonth: 3, birthYear2: 94, female: true, serial: '0001' });
    const m = parseNik('3174992507900002');
    expect(m.ok && m.parts.female).toBe(false);
    expect(m.ok && m.parts.birthDay).toBe(25);
  });

  it('rejects wrong length, unknown province, impossible dates, 00 codes and serial 0000', () => {
    expect(parseNik('317499520394000')).toMatchObject({ ok: false, reason: expect.stringMatching(/16 digits/) });
    expect(parseNik('317499520394000A')).toMatchObject({ ok: false });
    expect(parseNik('9974995203940001')).toMatchObject({ ok: false, reason: expect.stringMatching(/province/) });
    expect(parseNik('3174993203940001')).toMatchObject({ ok: false, reason: expect.stringMatching(/date of birth/) }); // day 32
    expect(parseNik('3174997213940001')).toMatchObject({ ok: false, reason: expect.stringMatching(/date of birth/) }); // day 72-40=32
    expect(parseNik('3174995213940001')).toMatchObject({ ok: false }); // month 13
    expect(parseNik('3100995203940001')).toMatchObject({ ok: false, reason: expect.stringMatching(/00/) });
    expect(parseNik('3174995203940000')).toMatchObject({ ok: false, reason: expect.stringMatching(/0000/) });
    // The four Papua provinces created in 2022 are valid.
    expect(parseNik('9501012501900001').ok).toBe(true);
  });

  it('checks the NIK against the date of birth and sex printed on the card', () => {
    const r = parseNik('3174995203940001');
    if (!r.ok) throw new Error('fixture');
    expect(nikMatchesCard(r.parts, '1994-03-12', 'PEREMPUAN')).toEqual({ date: true, sex: true });
    expect(nikMatchesCard(r.parts, '1994-03-13', 'PEREMPUAN')).toEqual({ date: false, sex: true });
    expect(nikMatchesCard(r.parts, '1994-03-12', 'LAKI-LAKI')).toEqual({ date: true, sex: false });
    expect(nikMatchesCard(r.parts, null, null)).toEqual({ date: null, sex: null });
  });

  it('masks to first and last four digits; the keyed hash depends on the key and never contains the NIK', () => {
    expect(maskNik('3174995203940001')).toBe('3174********0001');
    const a = nikHash('3174995203940001', 'k1'), b = nikHash('3174995203940001', 'k2');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(a).toBe(nikHash('3174995203940001', 'k1'));
    expect(a).not.toContain('3174995203940001');
  });
});

describe('names', () => {
  it('matches the same words in any order, ignoring case, punctuation and titles', () => {
    expect(compareNames('Emma Clark', 'EMMA CLARK')).toBe('match');
    expect(compareNames('Emma Clark', 'CLARK, EMMA')).toBe('match');
    expect(compareNames('Daniel Hall', 'DR. DANIEL HALL, S.E.')).toBe('match');
  });
  it('flags a one-letter slip or an extra middle name as close, other names as different', () => {
    expect(compareNames('Emma Clark', 'EMMA CLARKE')).toBe('close');
    expect(compareNames('Grace Lewis', 'GRACE AMELIA LEWIS')).toBe('close');
    expect(compareNames('Emma Clark', 'DANIEL HALL')).toBe('different');
    expect(compareNames('Emma Clark', '')).toBe('different');
  });
});

describe('face geometry', () => {
  it('decodes one YuNet detection per stride cell, mapping box and landmarks to input pixels', () => {
    const out: Record<string, { data: Float32Array }> = {};
    for (const s of [8, 16, 32]) {
      const n = (640 / s) ** 2;
      out[`cls_${s}`] = { data: new Float32Array(n) };
      out[`obj_${s}`] = { data: new Float32Array(n) };
      out[`bbox_${s}`] = { data: new Float32Array(n * 4) };
      out[`kps_${s}`] = { data: new Float32Array(n * 10) };
    }
    // stride 32, row 5, col 7: score sqrt(0.9 * 0.9) = 0.9; centre (7.5, 5.5) * 32; size e^1 * 32
    const i = 5 * 20 + 7;
    out.cls_32!.data[i] = 0.9; out.obj_32!.data[i] = 0.9;
    out.bbox_32!.data.set([0.5, 0.5, 1, 1], i * 4);
    out.kps_32!.data.set([0.2, 0.3, 0.8, 0.3, 0.5, 0.5, 0.3, 0.8, 0.7, 0.8], i * 10);
    const faces = decodeYunet(out);
    expect(faces).toHaveLength(1);
    const f = faces[0]!;
    expect(f.score).toBeCloseTo(0.9, 5);
    const w = Math.E * 32;
    expect(f.box.x).toBeCloseTo(7.5 * 32 - w / 2, 3);
    expect(f.box.y).toBeCloseTo(5.5 * 32 - w / 2, 3);
    expect(f.box.w).toBeCloseTo(w, 3);
    expect(f.landmarks[0]![0]).toBeCloseTo((0.2 + 7) * 32, 3);
    expect(f.landmarks[4]![1]).toBeCloseTo((0.8 + 5) * 32, 3);
  });

  it('keeps the best of overlapping faces (NMS) and separate faces apart', () => {
    const f = (x: number, score: number): DetectedFace => ({ box: { x, y: 0, w: 100, h: 100 }, landmarks: [], score });
    expect(iou(f(0, 1).box, f(50, 1).box)).toBeCloseTo(1 / 3, 5);
    const kept = nms([f(0, 0.8), f(10, 0.95), f(300, 0.7)]);
    expect(kept.map((k) => k.box.x)).toEqual([10, 300]);
  });

  it('recovers a known similarity transform and samples the aligned crop through its inverse', () => {
    const dst: [number, number][] = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];
    // src = dst scaled by 2, rotated 30°, moved by (100, 50) → the transform must undo exactly that.
    const t = Math.PI / 6, k = 2;
    const src = dst.map(([x, y]) => [k * (Math.cos(t) * x - Math.sin(t) * y) + 100, k * (Math.sin(t) * x + Math.cos(t) * y) + 50] as [number, number]);
    const m = similarityTransform(src, dst);
    for (let i = 0; i < 5; i++) {
      const [x, y] = src[i]!;
      expect(m.a * x - m.b * y + m.tx).toBeCloseTo(dst[i]![0], 6);
      expect(m.b * x + m.a * y + m.ty).toBeCloseTo(dst[i]![1], 6);
    }
    // An image that is white where the template's nose lands maps that pixel to white.
    const img = { width: 400, height: 400, data: Buffer.alloc(400 * 400 * 3) };
    const [nx, ny] = src[2]!;
    for (let y = Math.floor(ny) - 3; y <= Math.floor(ny) + 3; y++) for (let x = Math.floor(nx) - 3; x <= Math.floor(nx) + 3; x++) img.data.fill(255, (y * 400 + x) * 3, (y * 400 + x) * 3 + 3);
    const crop = alignFace(img, src);
    expect(crop[(72 * 112 + 56) * 3]).toBeGreaterThan(200);
    expect(crop[(10 * 112 + 10) * 3]).toBe(0);
  });

  it('cosine of unit vectors', () => {
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([1, 0]))).toBe(1);
    expect(cosine(Float32Array.from([1, 0]), Float32Array.from([0, 1]))).toBe(0);
  });
});

describe('decision', () => {
  const unit = (v: number[]) => { const n = Math.hypot(...v); return Float32Array.from(v.map((x) => x / n)); };
  const face = (emb: Float32Array, extra: Partial<FaceAnalysis['primary'] & object> = {}, faces = 1): FaceAnalysis => {
    const f: DetectedFace = { box: { x: 0, y: 0, w: 200, h: 240 }, landmarks: [], score: 0.93 };
    return { image: { width: 640, height: 640 }, faces: Array(faces).fill(f), primary: { face: f, embedding: emb, sharpness: 500, brightness: 120, ...extra } };
  };
  const reading: KtpReading = { document: 'ktp', nik: '3174995203940001', name: 'EMMA CLARK', birth_place: 'JAKARTA', birth_date: '1994-03-12', gender: 'PEREMPUAN', province: 'DKI JAKARTA', regency: 'KOTA JAKARTA SELATAN', legibility: 'clear', concerns: [] };
  const same = unit([1, 0.1, 0]), close = unit([1, 4, 0]), other = unit([0, 1, 0]);
  const base = { directoryName: 'Emma Clark', reading, ktpFaces: face(same), selfie: face(same), source: 'upload' as const, duplicateOf: null };

  it('verified when every check passes', () => {
    const r = evaluate(base);
    expect(r.outcome).toBe('verified');
    expect(r.checks.every((c) => c.status === 'pass')).toBe(true);
    expect(r.nik).toBe('3174995203940001');
    expect(r.faceScore).toBeCloseTo(1, 5);
  });
  it('failed for a different face, a wrong NIK date, another name, a duplicate NIK or not a KTP', () => {
    expect(evaluate({ ...base, selfie: face(other) }).checks.find((c) => c.key === 'face_match')).toMatchObject({ status: 'fail' });
    expect(evaluate({ ...base, selfie: face(other) }).outcome).toBe('failed');
    expect(evaluate({ ...base, reading: { ...reading, birth_date: '1994-03-13' } }).outcome).toBe('failed');
    expect(evaluate({ ...base, reading: { ...reading, name: 'DANIEL HALL' } }).outcome).toBe('failed');
    expect(evaluate({ ...base, duplicateOf: { name: 'Grace Lewis', account: 'recipient3.testnet' } }).checks.find((c) => c.key === 'duplicate')).toMatchObject({ status: 'fail', detail: expect.stringMatching(/Grace Lewis/) });
    expect(evaluate({ ...base, reading: { ...reading, document: 'not_id' } }).outcome).toBe('failed');
    expect(evaluate({ ...base, reading: { ...reading, nik: null } }).outcome).toBe('failed');
    expect(evaluate({ ...base, ktpFaces: { ...face(same), faces: [], primary: null } }).outcome).toBe('failed');
  });
  it('needs review for a borderline face, a close name, a specimen upload, document concerns or a poor face photo', () => {
    const borderline = evaluate({ ...base, selfie: face(close) });
    expect(borderline.faceScore!).toBeGreaterThan(0.28);
    expect(borderline.faceScore!).toBeLessThan(0.363);
    expect(borderline.outcome).toBe('needs_review');
    expect(evaluate({ ...base, reading: { ...reading, name: 'EMMA CLARKE' } }).outcome).toBe('needs_review');
    expect(evaluate({ ...base, reading: { ...reading, document: 'ktp_specimen' } }).outcome).toBe('needs_review');
    expect(evaluate({ ...base, reading: { ...reading, document: 'ktp_specimen', concerns: ['marked as specimen'] }, source: 'specimen' }).outcome).toBe('verified');
    expect(evaluate({ ...base, reading: { ...reading, concerns: ['photo of a screen'] } }).checks.find((c) => c.key === 'document_concerns')).toMatchObject({ status: 'review', detail: expect.stringMatching(/copy/) });
    expect(evaluate({ ...base, selfie: face(same, {}, 2) }).outcome).toBe('needs_review');
    expect(evaluate({ ...base, selfie: face(same, { sharpness: 10 }) }).checks.find((c) => c.key === 'selfie_face')).toMatchObject({ status: 'review', detail: expect.stringMatching(/blurry/) });
  });
});
