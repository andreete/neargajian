// Self-test of the face engine (Phase 21): loads both ONNX models, then compares the committed
// synthetic specimens: Daniel's KTP photo vs his face photo must match, vs the impostor must not.
// Proves onnxruntime-node and sharp work on this machine or image (the Dockerfile runs it at build).
// Usage: node scripts/vision-selftest.ts   (after npm run vision:models). Exit 1 on any failure.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cosine, createFaceEngine, faceModelsPresent, modelsDir, SFACE_COSINE_THRESHOLD } from '../src/server/identity/face.ts';

const dir = join(process.cwd(), 'public', 'specimens');
if (!faceModelsPresent()) {
  console.error(`vision self-test: model files missing in ${modelsDir()} (run npm run vision:models)`);
  process.exit(1);
}
const engine = createFaceEngine();
const embedding = async (file: string) => {
  const a = await engine.analyze(readFileSync(join(dir, file)));
  if (!a.primary) throw new Error(`no face found in ${file}`);
  return a.primary.embedding;
};
try {
  const ktp = await embedding('daniel-ktp.jpg');
  const same = cosine(ktp, await embedding('daniel-selfie.jpg'));
  const other = cosine(ktp, await embedding('impostor-selfie.jpg'));
  const ok = same >= SFACE_COSINE_THRESHOLD && other < SFACE_COSINE_THRESHOLD;
  console.log(`vision self-test: ${engine.id}; same person ${same.toFixed(3)}, impostor ${other.toFixed(3)} (threshold ${SFACE_COSINE_THRESHOLD}): ${ok ? 'ok' : 'FAILED'}`);
  process.exit(ok ? 0 : 1);
} catch (error) {
  console.error(`vision self-test: FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
