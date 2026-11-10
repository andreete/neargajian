#!/usr/bin/env node
// Downloads the two face models used by the identity check into models/vision/ (git-ignored),
// each verified against a pinned SHA-256 (the Git LFS object IDs in github.com/opencv/opencv_zoo):
//   - YuNet face detector, face_detection_yunet_2023mar.onnx (MIT, Shiqi Yu et al.)
//   - SFace face recognizer, face_recognition_sface_2021dec.onnx (Apache-2.0, Zhong et al.)
// Usage: npm run vision:models   (no-op when both files are present and match)
// Exit 1 if a file cannot be downloaded or does not match its hash: nothing unverified is kept.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const VISION_MODELS = [
  {
    file: 'face_detection_yunet_2023mar.onnx',
    sha256: '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
    urls: [
      'https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx',
      'https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx',
    ],
  },
  {
    file: 'face_recognition_sface_2021dec.onnx',
    sha256: '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79',
    urls: [
      'https://huggingface.co/opencv/face_recognition_sface/resolve/main/face_recognition_sface_2021dec.onnx',
      'https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx',
    ],
  },
];

const dir = process.env.VISION_MODELS_DIR || join(process.cwd(), 'models', 'vision');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
mkdirSync(dir, { recursive: true });

let failed = false;
for (const m of VISION_MODELS) {
  const target = join(dir, m.file);
  if (existsSync(target) && sha(readFileSync(target)) === m.sha256) {
    console.log(`ok       ${m.file} (already present, SHA-256 matches)`);
    continue;
  }
  let done = false;
  for (const url of m.urls) {
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180_000) });
      if (!res.ok) { console.error(`skip     ${url}: HTTP ${res.status}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      const got = sha(buf);
      if (got !== m.sha256) { console.error(`mismatch ${url}: SHA-256 ${got}`); continue; }
      writeFileSync(`${target}.part`, buf);
      renameSync(`${target}.part`, target);
      console.log(`fetched  ${m.file} (${(buf.length / 1e6).toFixed(1)} MB, SHA-256 verified) from ${new URL(url).host}`);
      done = true;
      break;
    } catch (error) {
      console.error(`skip     ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!done) { failed = true; rmSync(`${target}.part`, { force: true }); console.error(`FAILED   ${m.file}: no source gave the pinned file`); }
}
process.exit(failed ? 1 : 0);
