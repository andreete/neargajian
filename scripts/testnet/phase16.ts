#!/usr/bin/env node
// Phase 16 operations that are not part of the app's normal flow. Vault calls are signed with
// the role's RESTRICTED function-call key; token calls with the admin's key. Every step is
// printed with its tx hash and appended to .tmp/phase16-ops.json (public data only).
//
//   node scripts/testnet/phase16.ts migrate
//       Moves every available tUSDC of the Phase 04 vault into the final vault: an approved run
//       of the OLD vault pays the admin (create_run → approve ×2 → start_release → pay_row), then
//       the admin funds the new vault with ft_transfer_call (the only way the vault books funds).
//   node --env-file=.env scripts/testnet/phase16.ts duplicate <chain-run-id> <row-index>
//       Repeats pay_row for a row that is already paid, in a run that is still Releasing, with
//       the worker's key and the row's real proof (from the app database). Must be refused.
//   node scripts/testnet/phase16.ts fund <amount-tusdc>
//       The admin mints test tUSDC (mock token) and funds the final vault (ft_transfer_call).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildPayoutTree, newReviewSalt, proofFor, reviewDigest, toHex, type PayoutLeaf } from '../../src/server/commitments.ts';
import { formatAmount, parseAmount } from '../../src/server/money.ts';
// @ts-expect-error plain .mjs helper without type declarations
import { LEGACY_VAULT, MASTER, ROLES, TOKEN, VAULT, rpc, vaultKey } from './signer-keys.mjs';

type Role = 'maker' | 'approver1' | 'approver2' | 'worker' | 'admin';
interface Step { at: string; label: string; signer: string; contract: string; method: string; expect: 'ok' | 'fail'; tx?: string; ok: boolean; result: string }
const nearSh = new URL('./near.sh', import.meta.url).pathname;
const LOG = '.tmp/phase16-ops.json';

function record(step: Step) {
  mkdirSync('.tmp', { recursive: true });
  const all = existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) as Step[] : [];
  all.push(step);
  writeFileSync(LOG, JSON.stringify(all, null, 2));
}

function run(label: string, signer: string, contract: string, method: string, args: object, sign: string[], opts: { expect?: 'ok' | 'fail'; gas?: string; deposit?: string } = {}): Step {
  const expect = opts.expect ?? 'ok';
  const out = spawnSync(nearSh, [
    'contract', 'call-function', 'as-transaction', contract, method, 'json-args', JSON.stringify(args),
    'prepaid-gas', opts.gas ?? '50 Tgas', 'attached-deposit', opts.deposit ?? '0 NEAR', 'sign-as', signer,
    'network-config', 'testnet', ...sign, 'send',
  ], { encoding: 'utf8' });
  const text = (out.stdout + out.stderr).replace(/\x1b\[[0-9;]*m/g, '');
  const tx = /Transaction ID: (\w+)/.exec(text)?.[1];
  const ok = out.status === 0 && !/Error:/.test(text);
  const panic = /Smart contract panicked: ([^"\\)]+)/.exec(text)?.[1];
  const value = /return value[^\n]*\n([\s\S]*?)(?:\n\n|$)/.exec(text)?.[1]?.trim().split('\n')[0];
  const step: Step = { at: new Date().toISOString(), label, signer, contract, method, expect, ok, result: ok ? (value ?? '') : (panic ?? text.slice(-300)) };
  if (tx) step.tx = tx;
  record(step);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label} [${ok === (expect === 'ok') ? 'as expected' : 'UNEXPECTED'}] ${tx ?? '(no tx)'} ${step.result}`);
  if (ok !== (expect === 'ok')) throw new Error(`step "${label}" did not behave as expected`);
  return step;
}

async function vaultCall(vault: string, label: string, role: Role, method: string, args: object, expect: 'ok' | 'fail' = 'ok') {
  const key = await vaultKey(ROLES[role], vault);
  return run(label, ROLES[role], vault, method, args, ['sign-with-access-key-file', key.path], { expect });
}
function adminTokenCall(label: string, method: string, args: object, deposit: string, gas = '100 Tgas') {
  return run(label, ROLES.admin, TOKEN, method, args, ['sign-with-legacy-keychain'], { deposit, gas });
}
async function view<T>(contract: string, method: string, args: object): Promise<T> {
  const r = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: contract, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') });
  return JSON.parse(Buffer.from(r.result).toString()) as T;
}
const tusdc = (s: string) => { const p = parseAmount(s, 1_000_000n); if (!p.ok) throw new Error(p.message); return p.value; };

async function migrate() {
  const bal = await view<{ available: string; reserved: string }>(LEGACY_VAULT, 'get_balances', {});
  const amount = BigInt(bal.available);
  if (bal.reserved !== '0' || amount <= 0n) throw new Error(`legacy vault not idle: ${JSON.stringify(bal)}`);
  if (amount > 1_000_000n) throw new Error('more than the 1 tUSDC row cap: split into several rows');
  const wf = await view<{ revision: number }>(LEGACY_VAULT, 'get_workflow', {});
  const runId = `p16-migrate-${new Date().toISOString().slice(0, 16).replace(/\D/g, '')}`;
  const leaves: PayoutLeaf[] = [{ index: 0, accountId: ROLES.admin, amount }];
  const tree = buildPayoutTree(leaves);
  const digest = reviewDigest(newReviewSalt(), 'consolidated', [{ accountId: ROLES.admin, receiverName: 'GAJIAN admin (treasury)', currency: 'tUSDC', amount, mobilePhone: '+447700900000', email: 'treasury@example.com' }]);
  console.log(`migrate ${formatAmount(amount)} tUSDC: ${LEGACY_VAULT} → ${ROLES.admin} (approved run ${runId}) → ${VAULT}`);
  await vaultCall(LEGACY_VAULT, 'migration run: create (maker)', 'maker', 'create_run', { run_id: runId, workflow_revision: wf.revision, row_count: 1, total: amount.toString(), payout_root: toHex(tree.root), review_digest: toHex(digest), supersedes: null });
  await vaultCall(LEGACY_VAULT, 'migration run: approve (approver 1)', 'approver1', 'approve', { run_id: runId });
  await vaultCall(LEGACY_VAULT, 'migration run: approve (approver 2)', 'approver2', 'approve', { run_id: runId });
  await vaultCall(LEGACY_VAULT, 'migration run: start_release (worker)', 'worker', 'start_release', { run_id: runId });
  await vaultCall(LEGACY_VAULT, 'migration run: pay_row 0 → admin (worker)', 'worker', 'pay_row', { run_id: runId, index: 0, receiver_id: ROLES.admin, amount: amount.toString(), proof: proofFor(tree, 0).map(toHex) });
  adminTokenCall(`admin funds ${VAULT} with ${formatAmount(amount)} tUSDC (ft_transfer_call)`, 'ft_transfer_call', { receiver_id: VAULT, amount: amount.toString(), msg: '' }, '1 yoctoNEAR');
  console.log(JSON.stringify({ runId, legacy: await view(LEGACY_VAULT, 'get_balances', {}), final: await view(VAULT, 'get_balances', {}) }));
}

async function duplicate(chainRunId: string, index: number) {
  const { getDatabase, closeDatabase } = await import('../../src/server/db/client.ts');
  const { sqlite } = getDatabase();
  const v = sqlite.prepare('select id, payout_root as root, vault_contract_id as vault from run_versions where chain_run_id = ?').get(chainRunId) as { id: string; root: string; vault: string } | undefined;
  if (!v) throw new Error(`no version ${chainRunId}`);
  const rows = sqlite.prepare('select row_index as i, near_account_id as a, amount from version_rows where version_id = ? order by row_index').all(v.id) as { i: number; a: string; amount: string }[];
  closeDatabase();
  const tree = buildPayoutTree(rows.map((r) => ({ index: r.i, accountId: r.a, amount: BigInt(r.amount) })));
  if (toHex(tree.root) !== v.root) throw new Error('rows do not match the stored payout root');
  const run0 = await view<{ status: string; paid_count: number; row_count: number }>(v.vault, 'get_run', { run_id: chainRunId });
  const row = await view<{ status: string } | null>(v.vault, 'get_row', { run_id: chainRunId, index });
  console.log(`run ${chainRunId}: ${run0.status}, ${run0.paid_count} of ${run0.row_count} paid; row ${index}: ${row?.status}`);
  if (run0.status !== 'Releasing' || row?.status !== 'Paid') throw new Error('needs a run that is still Releasing and a row that is already Paid');
  const r = rows[index]!;
  await vaultCall(v.vault, `duplicate pay_row ${index} on a paid row while the run is Releasing (worker)`, 'worker', 'pay_row',
    { run_id: chainRunId, index, receiver_id: r.a, amount: r.amount, proof: proofFor(tree, index).map(toHex) }, 'fail');
  const after = await view<{ status: string; paid_count: number }>(v.vault, 'get_run', { run_id: chainRunId });
  console.log(`after: ${after.status}, paid ${after.paid_count} (unchanged)`);
}

const [cmd, a, b] = process.argv.slice(2);
if (!String(MASTER).endsWith('.testnet')) throw new Error('testnet only');
if (cmd === 'migrate') await migrate();
else if (cmd === 'duplicate' && a && b) await duplicate(a, Number(b));
else if (cmd === 'fund' && a) {
  const amount = tusdc(a).toString();
  adminTokenCall(`admin mints ${a} test tUSDC to itself (mock token)`, 'mint', { account_id: ROLES.admin, amount }, '0 NEAR', '30 Tgas');
  adminTokenCall(`admin funds ${VAULT} with ${a} tUSDC (ft_transfer_call)`, 'ft_transfer_call', { receiver_id: VAULT, amount, msg: '' }, '1 yoctoNEAR');
  console.log(JSON.stringify({ final: await view(VAULT, 'get_balances', {}) }));
}
else { console.error('usage: phase16.ts migrate | duplicate <chain-run-id> <index> | fund <amount>'); process.exitCode = 2; }
