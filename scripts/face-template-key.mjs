#!/usr/bin/env node
// Phase 24: generates the face template key(s) into the git-ignored .env, NEVER printing them.
//   FACE_TEMPLATE_KEY          this copy's key (AES-256-GCM of the encrypted face templates)
//   HOSTED_FACE_TEMPLATE_KEY   with --hosted: a separate key for the public demo on Railway (kept
//                              here only so it can be set on Railway again; never used locally)
// A key that is already set is kept (a new key makes the stored templates unreadable: the admin
// would have to run the identity checks again). Every other line of .env is kept as it is.
// Usage: node scripts/face-template-key.mjs [--hosted]
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

const envPath = new URL('../.env', import.meta.url);
const names = ['FACE_TEMPLATE_KEY', ...(process.argv.includes('--hosted') ? ['HOSTED_FACE_TEMPLATE_KEY'] : [])];
const text = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
const lines = text.length ? text.split('\n') : [];
const added = [];
const kept = [];
for (const name of names) {
  const i = lines.findIndex((l) => l.startsWith(`${name}=`));
  if (i >= 0 && lines[i].slice(name.length + 1).trim()) { kept.push(name); continue; }
  const line = `${name}=${randomBytes(32).toString('base64')}`;
  if (i >= 0) lines[i] = line;
  else {
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    if (!lines.some((l) => l.startsWith('# ---- Face check'))) lines.push('', '# ---- Face check (Phase 24): face template encryption keys; never commit, print or share ----');
    lines.push(line, '');
  }
  added.push(name);
}
if (added.length) {
  const tmp = new URL('../.env.face-key.tmp', import.meta.url);
  writeFileSync(tmp, lines.join('\n'), { mode: 0o600 });
  renameSync(tmp, envPath);
  chmodSync(envPath, 0o600);
}
console.log(`.env (mode 600): ${added.length ? `generated ${added.join(', ')}` : 'nothing to generate'}${kept.length ? `; kept ${kept.join(', ')} (already set)` : ''}. Values not printed.`);
