#!/usr/bin/env node
/**
 * Builds the SYNTHETIC identity specimens in public/specimens/ (committed; run once, by hand):
 * a SPECIMEN KTP card and a separate "selfie" for each of the three demo recipients, plus an
 * impostor selfie for the mismatch demo. Every card says SPECIMEN / NOT A REAL KTP.
 *
 * Faces: AI-generated (StyleGAN) images from Wikimedia Commons, public domain ("this person does
 * not exist"); downloaded here and checked against Commons' SHA-1. Names, NIKs and addresses are
 * invented: each NIK uses kecamatan code 99, which does not exist in Kota Jakarta Selatan (3174),
 * so it cannot be a real person's NIK. Usage: node scripts/make-identity-specimens.ts
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { createFaceEngine } from '../src/server/identity/face.ts';

const UA = 'SentFundDev/1.0 (hackathon synthetic test data; one-off fetch)';
const SOURCES = {
  emma: { url: 'https://upload.wikimedia.org/wikipedia/commons/1/1f/Woman_1.jpg', sha1: '24ba86cc4c84ef76b9430d1d0c3a33bb0f77ec7d', page: 'https://commons.wikimedia.org/wiki/File:Woman_1.jpg' },
  daniel: { url: 'https://upload.wikimedia.org/wikipedia/commons/a/a7/Man_2.jpg', sha1: '94109e44be459c4f7ecf68af58c06b864bc19e35', page: 'https://commons.wikimedia.org/wiki/File:Man_2.jpg' },
  grace: { url: 'https://upload.wikimedia.org/wikipedia/commons/1/1c/This_Person_Does_Not_Exist_example.jpg', sha1: 'c958568ff4ade1e3144be3cc1d6bcfcba0f73200', page: 'https://commons.wikimedia.org/wiki/File:This_Person_Does_Not_Exist_example.jpg' },
  impostor: { url: 'https://upload.wikimedia.org/wikipedia/commons/d/de/GAN_Mensch_StyleGAN2.png', sha1: '3815c50de5a94886f277d07ace11a4314ac215a5', page: 'https://commons.wikimedia.org/wiki/File:GAN_Mensch_StyleGAN2.png' },
} as const;

interface Person { key: 'emma' | 'daniel' | 'grace'; account: string; name: string; nik: string; birthPlace: string; birthDate: string; gender: 'LAKI-LAKI' | 'PEREMPUAN'; blood: string; address: string; rtrw: string; village: string }
const PEOPLE: Person[] = [
  { key: 'emma', account: 'recipient1.sentfund-payroll.testnet', name: 'EMMA CLARK', nik: '3174995203940001', birthPlace: 'JAKARTA', birthDate: '12-03-1994', gender: 'PEREMPUAN', blood: 'O', address: 'JL. CONTOH RAYA NO. 1', rtrw: '001/002', village: 'CONTOH BARU' },
  { key: 'daniel', account: 'recipient2.sentfund-payroll.testnet', name: 'DANIEL HALL', nik: '3174992507900002', birthPlace: 'BANDUNG', birthDate: '25-07-1990', gender: 'LAKI-LAKI', blood: 'A', address: 'JL. SPESIMEN NO. 22', rtrw: '004/007', village: 'CONTOH LAMA' },
  { key: 'grace', account: 'recipient3.sentfund-payroll.testnet', name: 'GRACE LEWIS', nik: '3174994411880003', birthPlace: 'SURABAYA', birthDate: '04-11-1988', gender: 'PEREMPUAN', blood: 'B', address: 'JL. UJI COBA NO. 3', rtrw: '010/003', village: 'CONTOH TENGAH' },
];

const OUT = 'public/specimens';
mkdirSync(OUT, { recursive: true });
const engine = createFaceEngine();

async function source(key: keyof typeof SOURCES): Promise<Buffer> {
  const s = SOURCES[key];
  const res = await fetch(s.url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${s.url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = createHash('sha1').update(buf).digest('hex');
  if (got !== s.sha1) throw new Error(`${s.url}: SHA-1 ${got} does not match Commons`);
  await new Promise((r) => setTimeout(r, 1500));
  return buf;
}

/** Crop around the detected face, padded to a portrait (ID photo) or square (selfie) frame. */
async function crop(buf: Buffer, ratio: number, pad: number): Promise<sharp.Sharp> {
  const a = await engine.analyze(buf);
  if (!a.primary) throw new Error('no face in source');
  const { x, y, w, h } = a.primary.face.box;
  const cx = x + w / 2, cy = y + h / 2;
  let ch = h * pad, cw = ch * ratio;
  const meta = await sharp(buf).metadata();
  cw = Math.min(cw, meta.width!); ch = Math.min(ch, meta.height!);
  const left = Math.round(Math.max(0, Math.min(meta.width! - cw, cx - cw / 2)));
  const top = Math.round(Math.max(0, Math.min(meta.height! - ch, cy - ch / 2)));
  return sharp(buf).extract({ left, top, width: Math.round(cw), height: Math.round(ch) });
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function cardSvg(p: Person): string {
  const rows: [string, string][] = [
    ['Nama', p.name], ['Tempat/Tgl Lahir', `${p.birthPlace}, ${p.birthDate}`], ['Jenis Kelamin', p.gender],
    ['Alamat', p.address], ['RT/RW', p.rtrw], ['Kel/Desa', p.village], ['Kecamatan', 'CONTOH'],
    ['Pekerjaan', 'KARYAWAN SWASTA'], ['Kewarganegaraan', 'WNI'], ['Berlaku Hingga', 'SEUMUR HIDUP'],
  ];
  const lines = rows.map(([k, v], i) => `<text x="40" y="${222 + i * 34}" class="k">${esc(k)}</text><text x="250" y="${222 + i * 34}" class="k">:</text><text x="270" y="${222 + i * 34}" class="v">${esc(v)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1012" height="638" viewBox="0 0 1012 638">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfe6fb"/><stop offset="0.55" stop-color="#e9f4fd"/><stop offset="1" stop-color="#bcdcf6"/></linearGradient></defs>
  <style>.h{font:700 30px 'DejaVu Sans',sans-serif;fill:#0b1838}.k{font:400 22px 'DejaVu Sans',sans-serif;fill:#0b1838}.v{font:700 22px 'DejaVu Sans',sans-serif;fill:#0b1838}.n{font:700 34px 'DejaVu Sans Mono',monospace;fill:#0b1838}.s{font:400 18px 'DejaVu Sans',sans-serif;fill:#0b1838}.w{font:800 50px 'DejaVu Sans',sans-serif;fill:#c62828;fill-opacity:0.28}.f{font:700 17px 'DejaVu Sans',sans-serif;fill:#ffffff}</style>
  <rect width="1012" height="638" rx="28" fill="url(#bg)"/>
  <text x="506" y="58" text-anchor="middle" class="h">PROVINSI DKI JAKARTA</text>
  <text x="506" y="96" text-anchor="middle" class="h">KOTA JAKARTA SELATAN</text>
  <text x="40" y="160" class="n">NIK</text><text x="250" y="160" class="n">:</text><text x="280" y="160" class="n">${p.nik}</text>
  ${lines}
  <text x="470" y="290" class="k">Gol. Darah</text><text x="590" y="290" class="k">:</text><text x="610" y="290" class="v">${esc(p.blood)}</text>
  <rect x="738" y="150" width="236" height="300" fill="#b71c1c"/>
  <text x="856" y="490" text-anchor="middle" class="s">JAKARTA SELATAN</text>
  <text x="856" y="514" text-anchor="middle" class="s">01-02-2024</text>
  <path d="M790 548 q18 -26 34 0 t34 -4 q14 -18 30 6" stroke="#0b1838" stroke-width="3" fill="none"/>
  <text x="470" y="400" text-anchor="middle" class="w" transform="rotate(-16 470 400)">SPECIMEN · SYNTHETIC</text>
  <rect x="0" y="588" width="1012" height="50" fill="#c62828"/>
  <text x="506" y="620" text-anchor="middle" class="f">SPECIMEN — NOT A REAL KTP. Synthetic test data for SentFund; AI-generated face (public domain).</text>
</svg>`;
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const files: Record<string, string> = {};
const write = (name: string, buf: Buffer) => { writeFileSync(`${OUT}/${name}`, buf); files[name] = sha256(buf); console.log('wrote', name, buf.length); };

const manifestPeople = [];
for (const p of PEOPLE) {
  const src = await source(p.key);
  // ID photo on the card: portrait crop, slightly flatter colours (a printed photo).
  const photo = await (await crop(src, 0.79, 1.55)).resize(236, 300).modulate({ saturation: 0.85, brightness: 1.03 }).toBuffer();
  const card = await sharp(Buffer.from(cardSvg(p))).composite([{ input: photo, left: 738, top: 150 }]).jpeg({ quality: 86 }).toBuffer();
  write(`${p.key}-ktp.jpg`, card);
  // Selfie: a different, wider framing, a small rotation and a colour shift.
  const selfie = await (await crop(src, 1, 1.9)).rotate(4, { background: '#d9d4cc' }).resize(640, 640, { fit: 'cover' }).modulate({ brightness: 0.96, saturation: 1.08, hue: 6 }).jpeg({ quality: 82 }).toBuffer();
  write(`${p.key}-selfie.jpg`, selfie);
  manifestPeople.push({ key: p.key, account: p.account, nameOnKtp: p.name, nik: p.nik, birthPlace: p.birthPlace, birthDate: p.birthDate.split('-').reverse().join('-'), gender: p.gender, faceSource: SOURCES[p.key].page });
}
const imp = await source('impostor');
write('impostor-selfie.jpg', await (await crop(imp, 1, 1.9)).resize(640, 640, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer());

const manifest = {
  note: 'SYNTHETIC identity specimens for SentFund tests and the public demo. Not real people, not real KTPs. Faces: AI-generated, public domain (Wikimedia Commons, see faceSource). NIKs use kecamatan code 99, which does not exist in 3174 (Kota Jakarta Selatan).',
  people: manifestPeople,
  impostor: { faceSource: SOURCES.impostor.page },
  sha256: files,
};
writeFileSync(`${OUT}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log('wrote manifest.json');
