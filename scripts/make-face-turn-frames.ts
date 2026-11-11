// Phase 24 · SYNTHETIC head-turn frames for the TEST-ONLY camera stand-in (this server has no
// camera). From each committed synthetic specimen face photo (public/specimens/<key>-selfie.jpg,
// AI-generated public-domain faces) it makes three 480x480 JPEGs in public/specimens/turn/:
//   <key>-center.jpg  the photo as it is (facing the camera)
//   <key>-left.jpg    the image's right half squeezed and its left half stretched around the nose,
//                     which moves the nose towards the image's right like a head turned to the
//                     person's LEFT (raw, unmirrored camera frame)
//   <key>-right.jpg   the reverse: the head turned to the person's RIGHT
// It then checks every frame with the real face engine (one face; yaw beyond the turn threshold in
// the right direction) and writes public/specimens/turn/manifest.json with the yaw values and
// SHA-256 of each file. Deterministic. Usage: node scripts/make-face-turn-frames.ts
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { createFaceEngine, decodeImage, faceModelsPresent, type RgbImage } from '../src/server/identity/face.ts';
import { TURN_YAW, directionOf, yawFromLandmarks } from '../src/server/identity/face-check.ts';

const SRC = join(process.cwd(), 'public', 'specimens');
const OUT = join(SRC, 'turn');
const PEOPLE = ['emma', 'daniel', 'grace', 'impostor'] as const;
const SIZE = 480;
const POSES = { center: [1, 1], left: [1.35, 0.45], right: [0.45, 1.35] } as const;

/** Horizontal piecewise-linear remap around cx: output x left of cx samples (cx - x) / kL, right of cx (x - cx) / kR. */
function warp(img: RgbImage, cx: number, kL: number, kR: number): RgbImage {
  const out = Buffer.alloc(img.data.length);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const sx = x < cx ? cx - (cx - x) / kL : cx + (x - cx) / kR;
      const x0 = Math.floor(sx), f = sx - x0;
      for (let c = 0; c < 3; c++) {
        const at = (xx: number) => img.data[(y * img.width + Math.max(0, Math.min(img.width - 1, xx))) * 3 + c]!;
        out[(y * img.width + x) * 3 + c] = Math.round(at(x0) * (1 - f) + at(x0 + 1) * f);
      }
    }
  }
  return { data: out, width: img.width, height: img.height };
}

if (!faceModelsPresent()) {
  console.error('face models missing: run npm run vision:models');
  process.exit(1);
}
const engine = createFaceEngine();
mkdirSync(OUT, { recursive: true });
const manifest: { note: string; turnThreshold: number; frames: Record<string, { yaw: number; sha256: string }> } = {
  note: 'SYNTHETIC head-turn frames for the TEST-ONLY camera stand-in (browser tests on a server without a camera). Made by scripts/make-face-turn-frames.ts from the synthetic specimen face photos (AI-generated, public domain; ../manifest.json). Not real people.',
  turnThreshold: TURN_YAW,
  frames: {},
};
let failed = false;
for (const key of PEOPLE) {
  const src = await decodeImage(readFileSync(join(SRC, `${key}-selfie.jpg`)));
  const base = await engine.analyzeImage(src);
  if (!base.primary) throw new Error(`no face in ${key}-selfie.jpg`);
  const cx = base.primary.face.landmarks[2]![0];
  for (const [pose, [kL, kR]] of Object.entries(POSES)) {
    const w = pose === 'center' ? src : warp(src, cx, kL, kR);
    const jpeg = await sharp(w.data, { raw: { width: w.width, height: w.height, channels: 3 } }).resize(SIZE, SIZE, { fit: 'cover' }).jpeg({ quality: 82, mozjpeg: false }).toBuffer();
    const name = `${key}-${pose}.jpg`;
    writeFileSync(join(OUT, name), jpeg);
    const a = await engine.analyze(jpeg);
    const yaw = a.primary ? yawFromLandmarks(a.primary.face.landmarks) : NaN;
    const ok = a.faces.length === 1 && directionOf(yaw) === pose;
    if (!ok) failed = true;
    manifest.frames[name] = { yaw: Number(yaw.toFixed(3)), sha256: createHash('sha256').update(jpeg).digest('hex') };
    console.log(`${name}: ${jpeg.length} bytes, faces ${a.faces.length}, yaw ${yaw.toFixed(3)} → ${directionOf(yaw)}${ok ? '' : '  FAILED'}`);
  }
}
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
process.exit(failed ? 1 : 0);
