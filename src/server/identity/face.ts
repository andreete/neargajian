/**
 * Face engine for the identity check (Phase 21): runs ON THIS SERVER, face images never leave it.
 *
 * - Detection: YuNet (OpenCV Zoo, face_detection_yunet_2023mar.onnx, MIT): faces with a box,
 *   five landmarks (eyes, nose tip, mouth corners) and a score.
 * - Recognition: SFace (OpenCV Zoo, face_recognition_sface_2021dec.onnx, Apache-2.0): the face is
 *   aligned to the standard 112x112 template with a similarity transform from the five landmarks,
 *   then turned into a 128-number embedding. Two faces are compared by cosine similarity.
 *
 * Pre- and post-processing follow OpenCV's FaceDetectorYN and FaceRecognizerSF (opencv/modules/
 * objdetect/src/face_detect.cpp and face_recognize.cpp): YuNet takes BGR 0–255 NCHW, decodes
 * anchor-free outputs per stride 8/16/32, then NMS; SFace takes RGB 0–255 NCHW.
 * Images are decoded with sharp (EXIF rotation applied). Models come from `npm run vision:models`
 * (SHA-256 pinned); without them the engine is off and the app says so.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import * as ort from 'onnxruntime-node';

export const FACE_ENGINE_ID = 'OpenCV YuNet 2023mar + SFace 2021dec (ONNX Runtime, on this server)';
export const DETECTOR_FILE = 'face_detection_yunet_2023mar.onnx';
export const RECOGNIZER_FILE = 'face_recognition_sface_2021dec.onnx';
/** OpenCV's published cosine threshold for SFace: at or above → same person (LFW). */
export const SFACE_COSINE_THRESHOLD = 0.363;

const DET_SIZE = 640;
const STRIDES = [8, 16, 32] as const;
/** Lower than OpenCV's 0.9 default so small, printed ID photos are still found; scores are reported. */
const SCORE_THRESHOLD = 0.6;
const NMS_IOU = 0.3;
/** ArcFace/SFace alignment template (112x112), same order as YuNet's landmarks. */
const TEMPLATE: readonly [number, number][] = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_SIDE = 2000;

export interface RgbImage { data: Buffer; width: number; height: number }
export interface DetectedFace {
  box: { x: number; y: number; w: number; h: number };
  landmarks: [number, number][];
  score: number;
}
export interface FaceAnalysis {
  image: { width: number; height: number };
  faces: DetectedFace[];
  /** The largest face: its embedding and simple quality measures. */
  primary: { face: DetectedFace; embedding: Float32Array; sharpness: number; brightness: number } | null;
}

export class ImageError extends Error {
  constructor(message: string) { super(message); this.name = 'ImageError'; }
}

/** Decode any JPEG/PNG/WebP into RGB (EXIF orientation applied, longest side ≤ 2000 px). */
export async function decodeImage(bytes: Buffer): Promise<RgbImage> {
  if (!bytes.length) throw new ImageError('The file is empty.');
  if (bytes.length > MAX_IMAGE_BYTES) throw new ImageError('The image is larger than 8 MB.');
  try {
    const meta = await sharp(bytes, { limitInputPixels: 50_000_000 }).metadata();
    if (!meta.format || !['jpeg', 'png', 'webp'].includes(meta.format)) throw new ImageError('Use a JPEG, PNG or WebP image.');
    const { data, info } = await sharp(bytes, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .removeAlpha().toColourspace('srgb').raw()
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof ImageError) throw error;
    throw new ImageError('The file is not a readable image.');
  }
}

// ------------------------------------------------------------------ geometry (pure, unit-tested)

export function iou(a: DetectedFace['box'], b: DetectedFace['box']): number {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

export function nms(faces: DetectedFace[], threshold = NMS_IOU): DetectedFace[] {
  const sorted = [...faces].sort((a, b) => b.score - a.score);
  const kept: DetectedFace[] = [];
  for (const f of sorted) if (kept.every((k) => iou(k.box, f.box) <= threshold)) kept.push(f);
  return kept;
}

type Outputs = Record<string, { data: ArrayLike<number> }>;

/** Decode YuNet's per-stride outputs (in the 640x640 input space) into faces. */
export function decodeYunet(out: Outputs, size = DET_SIZE, scoreThreshold = SCORE_THRESHOLD): DetectedFace[] {
  const faces: DetectedFace[] = [];
  for (const s of STRIDES) {
    const cols = size / s, rows = size / s;
    const get = (k: string) => { const t = out[`${k}_${s}`]; if (!t) throw new Error(`YuNet output ${k}_${s} missing`); return t.data; };
    const cls = get('cls'), obj = get('obj'), bbox = get('bbox'), kps = get('kps');
    const at = (a: ArrayLike<number>, i: number) => a[i] ?? 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const score = Math.sqrt(Math.min(Math.max(at(cls, i), 0), 1) * Math.min(Math.max(at(obj, i), 0), 1));
        if (score < scoreThreshold) continue;
        const cx = (c + at(bbox, i * 4)) * s, cy = (r + at(bbox, i * 4 + 1)) * s;
        const w = Math.exp(at(bbox, i * 4 + 2)) * s, h = Math.exp(at(bbox, i * 4 + 3)) * s;
        const landmarks: [number, number][] = [];
        for (let n = 0; n < 5; n++) landmarks.push([(at(kps, i * 10 + 2 * n) + c) * s, (at(kps, i * 10 + 2 * n + 1) + r) * s]);
        faces.push({ box: { x: cx - w / 2, y: cy - h / 2, w, h }, landmarks, score });
      }
    }
  }
  return nms(faces);
}

/** Least-squares similarity transform (rotation, uniform scale, translation) mapping src → dst. */
export function similarityTransform(src: readonly [number, number][], dst: readonly [number, number][]) {
  const n = src.length;
  const ms = src.reduce<[number, number]>((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n], [0, 0]);
  const md = dst.reduce<[number, number]>((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n], [0, 0]);
  let num1 = 0, num2 = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const [sx, sy] = src[i]!, [dx, dy] = dst[i]!;
    const px = sx - ms[0]!, py = sy - ms[1]!;
    const qx = dx - md[0]!, qy = dy - md[1]!;
    num1 += px * qx + py * qy;
    num2 += px * qy - py * qx;
    den += px * px + py * py;
  }
  const a = num1 / den, b = num2 / den;
  return { a, b, tx: md[0] - (a * ms[0] - b * ms[1]), ty: md[1] - (b * ms[0] + a * ms[1]) };
}

/** Aligned 112x112 RGB crop (bilinear sampling through the inverse similarity transform). */
export function alignFace(img: RgbImage, landmarks: [number, number][]): Buffer {
  const { a, b, tx, ty } = similarityTransform(landmarks, TEMPLATE);
  const det = a * a + b * b;
  const out = Buffer.alloc(112 * 112 * 3);
  for (let v = 0; v < 112; v++) {
    for (let u = 0; u < 112; u++) {
      const dx = u - tx, dy = v - ty;
      const x = (a * dx + b * dy) / det, y = (-b * dx + a * dy) / det;
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      for (let ch = 0; ch < 3; ch++) {
        const px = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height ? 0 : img.data[(yy * img.width + xx) * 3 + ch] ?? 0);
        const val = px(x0, y0) * (1 - fx) * (1 - fy) + px(x0 + 1, y0) * fx * (1 - fy) + px(x0, y0 + 1) * (1 - fx) * fy + px(x0 + 1, y0 + 1) * fx * fy;
        out[(v * 112 + u) * 3 + ch] = Math.round(val);
      }
    }
  }
  return out;
}

/** Variance of the Laplacian of the aligned face (grey): low = blurry. Mean grey = brightness. */
export function faceQuality(aligned: Buffer): { sharpness: number; brightness: number } {
  const g = new Float64Array(112 * 112);
  let sum = 0;
  for (let i = 0; i < g.length; i++) { const v = 0.299 * aligned[i * 3]! + 0.587 * aligned[i * 3 + 1]! + 0.114 * aligned[i * 3 + 2]!; g[i] = v; sum += v; }
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < 111; y++) {
    for (let x = 1; x < 111; x++) {
      const i = y * 112 + x;
      const lap = g[i - 1]! + g[i + 1]! + g[i - 112]! + g[i + 112]! - 4 * g[i]!;
      s += lap; s2 += lap * lap; n++;
    }
  }
  return { sharpness: s2 / n - (s / n) ** 2, brightness: sum / g.length };
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i]! * (b[i] ?? 0);
  return dot;
}

// ------------------------------------------------------------------ engine

export interface FaceEngine {
  readonly id: string;
  analyze(bytes: Buffer): Promise<FaceAnalysis>;
  analyzeImage(img: RgbImage): Promise<FaceAnalysis>;
  /** Faces' boxes in the decoded image, for covering them before the KTP goes to the text reader. */
  detect(img: RgbImage): Promise<DetectedFace[]>;
}

export function modelsDir(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return env.VISION_MODELS_DIR || join(/* turbopackIgnore: true */ process.cwd(), 'models', 'vision');
}

export function faceModelsPresent(dir = modelsDir()): boolean {
  return existsSync(join(/* turbopackIgnore: true */ dir, DETECTOR_FILE)) && existsSync(join(/* turbopackIgnore: true */ dir, RECOGNIZER_FILE));
}

export function createFaceEngine(dir = modelsDir()): FaceEngine {
  let sessions: Promise<{ det: ort.InferenceSession; rec: ort.InferenceSession }> | undefined;
  const load = () => (sessions ??= (async () => {
    const opts: ort.InferenceSession.SessionOptions = { logSeverityLevel: 3, intraOpNumThreads: 2, interOpNumThreads: 1 };
    return {
      det: await ort.InferenceSession.create(join(/* turbopackIgnore: true */ dir, DETECTOR_FILE), opts),
      rec: await ort.InferenceSession.create(join(/* turbopackIgnore: true */ dir, RECOGNIZER_FILE), opts),
    };
  })());

  async function detect(img: RgbImage): Promise<DetectedFace[]> {
    const { det } = await load();
    const scale = DET_SIZE / Math.max(img.width, img.height);
    const rw = Math.max(1, Math.round(img.width * scale)), rh = Math.max(1, Math.round(img.height * scale));
    const padded = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 3 } })
      .resize(rw, rh, { fit: 'fill' })
      .extend({ right: DET_SIZE - rw, bottom: DET_SIZE - rh, background: { r: 0, g: 0, b: 0 } })
      .raw().toBuffer();
    const plane = DET_SIZE * DET_SIZE;
    const input = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      input[i] = padded[i * 3 + 2]!; // B
      input[plane + i] = padded[i * 3 + 1]!; // G
      input[2 * plane + i] = padded[i * 3]!; // R
    }
    const out = await det.run({ input: new ort.Tensor('float32', input, [1, 3, DET_SIZE, DET_SIZE]) });
    return decodeYunet(out as unknown as Outputs).map((f) => ({
      score: f.score,
      box: { x: f.box.x / scale, y: f.box.y / scale, w: f.box.w / scale, h: f.box.h / scale },
      landmarks: f.landmarks.map(([x, y]) => [x / scale, y / scale] as [number, number]),
    }));
  }

  async function embed(aligned: Buffer): Promise<Float32Array> {
    const { rec } = await load();
    const plane = 112 * 112;
    const input = new Float32Array(3 * plane);
    for (let i = 0; i < plane; i++) {
      input[i] = aligned[i * 3]!; // R
      input[plane + i] = aligned[i * 3 + 1]!; // G
      input[2 * plane + i] = aligned[i * 3 + 2]!; // B
    }
    const out = await rec.run({ data: new ort.Tensor('float32', input, [1, 3, 112, 112]) });
    const fc1 = out.fc1;
    if (!fc1) throw new Error('SFace output fc1 missing');
    const v = Float32Array.from(fc1.data as Float32Array);
    let norm = 0;
    for (const x of v) norm += x * x;
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < v.length; i++) v[i] = v[i]! / norm;
    return v;
  }

  return {
    id: FACE_ENGINE_ID,
    detect,
    async analyze(bytes) {
      return this.analyzeImage(await decodeImage(bytes));
    },
    async analyzeImage(img) {
      const faces = await detect(img);
      const largest = [...faces].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)[0];
      if (!largest) return { image: { width: img.width, height: img.height }, faces, primary: null };
      const aligned = alignFace(img, largest.landmarks);
      const embedding = await embed(aligned);
      return { image: { width: img.width, height: img.height }, faces, primary: { face: largest, embedding, ...faceQuality(aligned) } };
    },
  };
}

let engine: FaceEngine | null | undefined;
let override: FaceEngine | null | undefined;

/** The engine, or null when the model files are missing on this copy. */
export function getFaceEngine(): FaceEngine | null {
  if (override !== undefined) return override;
  if (engine === undefined) engine = faceModelsPresent() ? createFaceEngine() : null;
  return engine;
}

export function setFaceEngineForTests(e: FaceEngine | null | undefined): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('test-only');
  override = e;
}
