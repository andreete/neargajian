/**
 * Password hashing with argon2id (Node's built-in implementation), stored in PHC format:
 * $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>  (OWASP minimum: 19 MiB, 2 passes, 1 lane).
 */
import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

interface Argon2Params { memory: number; passes: number; parallelism: number; tagLength: number }
const PARAMS: Argon2Params = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 };
const PHC_RE = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

function derive(password: string, salt: Buffer, p: Argon2Params): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2('argon2id', { message: password, nonce: salt, ...p }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

const b64 = (b: Buffer) => b.toString('base64').replace(/=+$/, '');

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8 || password.length > 256) throw new RangeError('password must be 8-256 characters');
  const salt = randomBytes(16);
  const key = await derive(password, salt, PARAMS);
  return ['', 'argon2id', 'v=19', `m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism}`, b64(salt), b64(key)].join('$');
}

export async function verifyPassword(password: string, phc: string): Promise<boolean> {
  const m = PHC_RE.exec(phc);
  if (!m || password.length > 256) return false;
  const [, memory, passes, parallelism, salt, hash] = m;
  const expected = Buffer.from(hash ?? '', 'base64');
  const actual = await derive(password, Buffer.from(salt ?? '', 'base64'), {
    memory: Number(memory), passes: Number(passes), parallelism: Number(parallelism), tagLength: expected.length,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Hash of a random password, verified against when the email is unknown so that unknown
 *  and known emails take the same time. */
let dummy: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(24).toString('base64'));
  return dummy;
}
