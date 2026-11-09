import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  type PayoutLeaf, buildPayoutTree, fromHex, leafHash, nodeHash, proofFor, reviewDigest, toHex, verifyProof,
} from '@/server/commitments';
import { U128_MAX, parseAmount } from '@/server/money';
import { isValidAccountId } from '@/server/near-account';

const VECTORS_PATH = new URL('../vectors/commitments.json', import.meta.url);
const M = 'gajian-payroll.testnet';

function rows(spec: [string, bigint][]): PayoutLeaf[] {
  return spec.map(([accountId, amount], index) => ({ index, accountId, amount }));
}

// Inputs for the shared Rust/TypeScript vectors. Outputs are computed, written once with
// GAJIAN_WRITE_VECTORS=1, then checked here and in contracts/vault (commitment.rs tests).
const TREE_CASES: Record<string, PayoutLeaf[]> = {
  one: rows([[`recipient1.${M}`, 50_000n]]),
  two: rows([[`recipient1.${M}`, 50_000n], [`recipient2.${M}`, 20_000n]]),
  three_odd: rows([[`recipient1.${M}`, 10_000n], [`recipient2.${M}`, 20_000n], [`recipient3.${M}`, 30_000n]]),
  five_duplicate_wallet: rows([
    [`recipient1.${M}`, 10_000n], [`recipient2.${M}`, 20_000n], [`recipient1.${M}`, 10_000n],
    [`recipient3.${M}`, 100_000n], [`recipient2.${M}`, 1n],
  ]),
  seven: rows(Array.from({ length: 7 }, (_, i) => [`gjn-emp-000${i + 1}.testnet`, BigInt((i + 1) * 10_000)] as [string, bigint])),
};
const LEAF_CASES: PayoutLeaf[] = [
  { index: 0, accountId: 'ab', amount: 1n },
  { index: 4_294_967_295, accountId: 'a'.repeat(64), amount: U128_MAX },
  { index: 999, accountId: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', amount: 1_000_000n },
];
const REVIEW_SALT = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1));
const REVIEW_ROWS = [
  { accountId: `recipient1.${M}`, receiverName: 'Emma Clark', currency: 'tUSDC', amount: 50_000n, mobilePhone: '+447700900001', email: 'emma@example.com' },
  { accountId: `recipient2.${M}`, receiverName: 'Zoë O’Brien', currency: 'tUSDC', amount: 20_000n, mobilePhone: '+447700900002', email: 'zoe@example.com' },
];

function computeVectors() {
  return {
    spec: 'docs/COMMITMENTS.md',
    leaves: LEAF_CASES.map((l) => ({ index: l.index, account_id: l.accountId, amount: l.amount.toString(), leaf: toHex(leafHash(l)) })),
    trees: Object.entries(TREE_CASES).map(([name, leaves]) => {
      const tree = buildPayoutTree(leaves);
      return {
        name,
        row_count: tree.rowCount,
        total: tree.total.toString(),
        root: toHex(tree.root),
        rows: leaves.map((l) => ({
          index: l.index, account_id: l.accountId, amount: l.amount.toString(),
          leaf: toHex(leafHash(l)), proof: proofFor(tree, l.index).map(toHex),
        })),
      };
    }),
    review_digest: {
      salt: REVIEW_SALT.toString('hex'),
      posting_mode: 'detailed',
      rows: REVIEW_ROWS.map((r) => ({ ...r, amount: r.amount.toString() })),
      digest: toHex(reviewDigest(REVIEW_SALT, 'detailed', REVIEW_ROWS)),
    },
  };
}

describe('shared commitment vectors', () => {
  it('match tests/vectors/commitments.json', () => {
    const computed = computeVectors();
    if (process.env.GAJIAN_WRITE_VECTORS === '1') {
      writeFileSync(VECTORS_PATH, `${JSON.stringify(computed, null, 2)}\n`);
    }
    expect(JSON.parse(readFileSync(VECTORS_PATH, 'utf8'))).toEqual(computed);
  });
});

describe('payout tree', () => {
  const tree = buildPayoutTree(TREE_CASES.five_duplicate_wallet ?? []);
  const leaves = TREE_CASES.five_duplicate_wallet ?? [];

  it('verifies every row and computes the exact total', () => {
    expect(tree.total).toBe(140_001n);
    for (const l of leaves) expect(verifyProof(tree.root, tree.rowCount, l, proofFor(tree, l.index))).toBe(true);
  });

  it('promotes an odd last node instead of duplicating it', () => {
    const three = buildPayoutTree(TREE_CASES.three_odd ?? []);
    const [a, b, c] = (TREE_CASES.three_odd ?? []).map(leafHash);
    expect(three.root.equals(nodeHash(nodeHash(a!, b!), c!))).toBe(true);
    expect(proofFor(three, 2)).toHaveLength(1);
  });

  it('rejects a changed amount, destination or index', () => {
    const l = leaves[1]!;
    const proof = proofFor(tree, 1);
    expect(verifyProof(tree.root, tree.rowCount, { ...l, amount: l.amount + 1n }, proof)).toBe(false);
    expect(verifyProof(tree.root, tree.rowCount, { ...l, accountId: `attacker.${M}` }, proof)).toBe(false);
    expect(verifyProof(tree.root, tree.rowCount, { ...l, index: 3 }, proof)).toBe(false);
    // row_count is stored by the contract at run creation, never supplied by the payer;
    // a count that changes the tree shape fails.
    expect(verifyProof(tree.root, 2, l, proof)).toBe(false);
    expect(verifyProof(tree.root, tree.rowCount, { ...l, index: tree.rowCount }, proof)).toBe(false);
    expect(verifyProof(tree.root, tree.rowCount, l, [...proof, proof[0]!])).toBe(false);
    expect(verifyProof(tree.root, tree.rowCount, l, proof.slice(1))).toBe(false);
  });

  it('treats the same wallet on two indexes as two distinct payouts', () => {
    const first = leaves[0]!;
    const third = leaves[2]!;
    expect(first.accountId).toBe(third.accountId);
    expect(first.amount).toBe(third.amount);
    expect(leafHash(first).equals(leafHash(third))).toBe(false);
    // A proof for index 0 cannot be replayed as index 2 (and vice versa).
    expect(verifyProof(tree.root, tree.rowCount, { ...first, index: 2 }, proofFor(tree, 0))).toBe(false);
    expect(verifyProof(tree.root, tree.rowCount, third, proofFor(tree, 2))).toBe(true);
  });

  it('refuses unordered rows, invalid accounts and empty or oversized runs', () => {
    expect(() => buildPayoutTree([{ index: 1, accountId: 'ab', amount: 1n }])).toThrow('ordered');
    expect(() => buildPayoutTree([])).toThrow('at least one');
    expect(() => leafHash({ index: 0, accountId: 'Bad.Account', amount: 1n })).toThrow('invalid account');
    expect(() => leafHash({ index: 0, accountId: 'ab', amount: 0n })).toThrow('positive');
    expect(() => buildPayoutTree(Array.from({ length: 1001 }, (_, i) => ({ index: i, accountId: 'ab', amount: 1n })))).toThrow('1000');
  });
});

describe('review digest', () => {
  it('depends on salt, posting mode and every private field', () => {
    const base = reviewDigest(REVIEW_SALT, 'detailed', REVIEW_ROWS);
    const otherSalt = Buffer.from(REVIEW_SALT);
    otherSalt[0] = 0xff;
    expect(reviewDigest(otherSalt, 'detailed', REVIEW_ROWS).equals(base)).toBe(false);
    expect(reviewDigest(REVIEW_SALT, 'consolidated', REVIEW_ROWS).equals(base)).toBe(false);
    const changed = REVIEW_ROWS.map((r, i) => (i === 1 ? { ...r, email: 'zoe2@example.com' } : r));
    expect(reviewDigest(REVIEW_SALT, 'detailed', changed).equals(base)).toBe(false);
    expect(() => reviewDigest(Buffer.alloc(16), 'detailed', REVIEW_ROWS)).toThrow('32 bytes');
  });
});

/** Minimal RFC 4180 reader for the trusted sample file (the real importer is Phase 09). */
function readSampleCsv(path: URL): string[][] {
  const text = readFileSync(path, 'utf8');
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); out.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); out.push(row); }
  return out.filter((r) => r.some((f) => f !== ''));
}

describe('1,000-row sample file', () => {
  it('builds a tree, generates and verifies all 1,000 proofs', () => {
    const [header, ...data] = readSampleCsv(new URL('../../public/templates/gajian-payroll-sample-1000.csv', import.meta.url));
    expect(header).toEqual(['near_account_id', 'receiver_name', 'currency', 'amount', 'mobile_phone', 'email']);
    expect(data).toHaveLength(1000);
    const leaves = data.map(([account, , , amount], index) => {
      const parsed = parseAmount(amount ?? '', 1_000_000n);
      if (!parsed.ok || !isValidAccountId(account ?? '')) throw new Error(`bad sample row ${index}`);
      return { index, accountId: account ?? '', amount: parsed.value };
    });
    const started = performance.now();
    const tree = buildPayoutTree(leaves);
    const proofs = leaves.map((l) => proofFor(tree, l.index));
    const allValid = leaves.every((l, i) => verifyProof(tree.root, 1000, l, proofs[i] ?? []));
    const ms = performance.now() - started;
    expect(allValid).toBe(true);
    expect(tree.total).toBe(56_690_860n); // docs/SAMPLE-DATA.md
    expect(Math.max(...proofs.map((p) => p.length))).toBe(10); // ceil(log2(1000))
    console.info(`1,000-row tree + 1,000 proofs generated and verified in ${ms.toFixed(1)} ms; root ${toHex(tree.root)}`);
    expect(fromHex(toHex(tree.root)).equals(tree.root)).toBe(true);
  });
});
