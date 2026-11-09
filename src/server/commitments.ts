/**
 * Payout commitments (specification: docs/COMMITMENTS.md). Mirrored byte-for-byte by
 * contracts/vault/src/commitment.rs; shared vectors in tests/vectors/commitments.json.
 *
 * - Leaf   = SHA-256("GAJIAN:payout-leaf:v1" ‖ 0x00 ‖ u32be(index) ‖ u8(len) ‖ account ‖ u128be(amount))
 * - Node   = SHA-256("GAJIAN:payout-node:v1" ‖ 0x00 ‖ left ‖ right)
 * - Tree   = leaves in row-index order; at each level pairs are hashed left to right and an
 *            odd last node is promoted unchanged (never duplicated). Root of 1 leaf = the leaf.
 * - Proof  = sibling hashes bottom-up, skipping levels where the node was promoted.
 * - Review digest = salted SHA-256 over the private review snapshot (never on-chain data).
 */
import { createHash, randomBytes } from 'node:crypto';
import { MAX_ROWS, U128_MAX } from './money';
import { isValidAccountId } from './near-account';

export const LEAF_TAG = 'GAJIAN:payout-leaf:v1';
export const NODE_TAG = 'GAJIAN:payout-node:v1';
export const REVIEW_TAG = 'GAJIAN:review-digest:v1';

export type Hash = Buffer; // always 32 bytes

export interface PayoutLeaf {
  index: number;
  accountId: string;
  amount: bigint;
}

const sha256 = (...parts: Uint8Array[]): Hash => {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return h.digest();
};

const tagBytes = (tag: string): Buffer => Buffer.concat([Buffer.from(tag, 'ascii'), Buffer.from([0])]);
const LEAF_PREFIX = tagBytes(LEAF_TAG);
const NODE_PREFIX = tagBytes(NODE_TAG);
const REVIEW_PREFIX = tagBytes(REVIEW_TAG);

function u32be(n: number): Buffer {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new RangeError('u32 out of range');
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

function u128be(v: bigint): Buffer {
  if (v < 0n || v > U128_MAX) throw new RangeError('u128 out of range');
  const b = Buffer.alloc(16);
  b.writeBigUInt64BE(v >> 64n, 0);
  b.writeBigUInt64BE(v & 0xffffffffffffffffn, 8);
  return b;
}

/** Length-prefixed UTF-8 string (u32be length). */
function str(s: string): Buffer {
  const bytes = Buffer.from(s.normalize('NFC'), 'utf8');
  return Buffer.concat([u32be(bytes.length), bytes]);
}

export function leafHash(leaf: PayoutLeaf): Hash {
  if (!isValidAccountId(leaf.accountId)) throw new RangeError(`invalid account id at index ${leaf.index}`);
  if (leaf.amount <= 0n) throw new RangeError(`amount must be positive at index ${leaf.index}`);
  const account = Buffer.from(leaf.accountId, 'ascii');
  return sha256(LEAF_PREFIX, u32be(leaf.index), Buffer.from([account.length]), account, u128be(leaf.amount));
}

export function nodeHash(left: Hash, right: Hash): Hash {
  if (left.length !== 32 || right.length !== 32) throw new RangeError('node children must be 32 bytes');
  return sha256(NODE_PREFIX, left, right);
}

/** All tree levels, level 0 = leaf hashes. */
export function buildLevels(leafHashes: Hash[]): Hash[][] {
  if (leafHashes.length === 0) throw new RangeError('a payout tree needs at least one row');
  if (leafHashes.length > MAX_ROWS) throw new RangeError(`at most ${MAX_ROWS} rows`);
  const levels: Hash[][] = [leafHashes];
  let level = leafHashes;
  while (level.length > 1) {
    const next: Hash[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i] as Hash;
      const right = level[i + 1];
      next.push(right ? nodeHash(left, right) : left); // odd last node is promoted
    }
    levels.push(next);
    level = next;
  }
  return levels;
}

export interface PayoutTree {
  root: Hash;
  rowCount: number;
  total: bigint;
  levels: Hash[][];
}

/** Builds the tree for rows that must be indexed 0..n-1 in order. */
export function buildPayoutTree(rows: PayoutLeaf[]): PayoutTree {
  rows.forEach((r, i) => {
    if (r.index !== i) throw new RangeError(`row ${i} has index ${r.index}; rows must be ordered 0..n-1`);
  });
  const total = rows.reduce((sum, r) => {
    const next = sum + r.amount;
    if (next > U128_MAX) throw new RangeError('total exceeds u128');
    return next;
  }, 0n);
  const levels = buildLevels(rows.map(leafHash));
  const top = levels[levels.length - 1] as Hash[];
  return { root: top[0] as Hash, rowCount: rows.length, total, levels };
}

/** Sibling hashes for `index`, bottom-up, skipping levels where the node was promoted. */
export function proofFor(tree: PayoutTree, index: number): Hash[] {
  if (!Number.isInteger(index) || index < 0 || index >= tree.rowCount) throw new RangeError('index out of range');
  const proof: Hash[] = [];
  let pos = index;
  for (const level of tree.levels.slice(0, -1)) {
    const sibling = pos % 2 === 1 ? pos - 1 : pos + 1;
    if (sibling < level.length) proof.push(level[sibling] as Hash);
    pos = Math.floor(pos / 2);
  }
  return proof;
}

/** Recomputes the root from a leaf and its proof; the tree shape comes from `rowCount`. */
export function verifyProof(root: Hash, rowCount: number, leaf: PayoutLeaf, proof: Hash[]): boolean {
  if (rowCount < 1 || rowCount > MAX_ROWS || leaf.index < 0 || leaf.index >= rowCount) return false;
  let hash: Hash;
  try {
    hash = leafHash(leaf);
  } catch {
    return false;
  }
  let pos = leaf.index;
  let size = rowCount;
  let used = 0;
  while (size > 1) {
    if (pos % 2 === 1) {
      const sib = proof[used++];
      if (!sib) return false;
      hash = nodeHash(sib, hash);
    } else if (pos + 1 < size) {
      const sib = proof[used++];
      if (!sib) return false;
      hash = nodeHash(hash, sib);
    }
    pos = Math.floor(pos / 2);
    size = Math.ceil(size / 2);
  }
  return used === proof.length && hash.equals(root);
}

export interface ReviewRow {
  accountId: string;
  receiverName: string;
  currency: string;
  amount: bigint;
  mobilePhone: string;
  email: string;
}

export type PostingMode = 'consolidated' | 'detailed';

export function newReviewSalt(): Buffer {
  return randomBytes(32);
}

/**
 * Salted digest of the private review snapshot. The salt stays in the app database, so
 * the digest reveals nothing about names, phones or emails, yet binds the approval to the
 * exact reviewed data. Rows are hashed in index order with their index.
 */
export function reviewDigest(salt: Buffer, postingMode: PostingMode, rows: ReviewRow[]): Hash {
  if (salt.length !== 32) throw new RangeError('salt must be 32 bytes');
  const parts: Buffer[] = [REVIEW_PREFIX, salt, str(postingMode), u32be(rows.length)];
  rows.forEach((r, i) => {
    parts.push(u32be(i), str(r.accountId), str(r.receiverName), str(r.currency), u128be(r.amount), str(r.mobilePhone), str(r.email));
  });
  return sha256(...parts);
}

export const toHex = (h: Hash): string => h.toString('hex');
export function fromHex(hex: string): Hash {
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new RangeError('expected 32-byte lowercase hex');
  return Buffer.from(hex, 'hex');
}
