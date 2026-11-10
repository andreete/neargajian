#!/usr/bin/env node
// Appends a PAID app run to docs/evidence/testnet-runs.json (public data only: run ID, rows with
// receiver account and base-unit amount, tx hashes and signers), read from the app database.
// `npm run judge:verify` then re-checks it on testnet. Refuses unless the run is Paid with every
// payout confirmed. Idempotent: a run already in the file is not added twice.
// Usage: node --env-file=.env scripts/testnet/record-run-evidence.ts <runId> <phase> "<label>"
import { readFileSync, writeFileSync } from 'node:fs';
import { closeDatabase, getDatabase } from '../../src/server/db/client.ts';

const [runId, phase, label] = process.argv.slice(2);
if (!runId || !phase || !label) { console.error('usage: record-run-evidence.ts <runId> <phase> "<label>"'); process.exit(2); }
const { sqlite } = getDatabase();
const v = sqlite.prepare("select * from run_versions where run_id = ? order by version_no desc limit 1").get(runId) as { id: string; chain_run_id: string; vault_contract_id: string; status: string; total: string; submit_tx_hash: string; workflow_snapshot: string } | undefined;
if (!v || v.status !== 'paid') throw new Error(`run ${runId} is not paid (${v?.status ?? 'no version'})`);
const snapshot = JSON.parse(v.workflow_snapshot) as { approvers: { chainAccountId: string }[]; releaseMode: string };
const rows = sqlite.prepare('select row_index as i, near_account_id as a, amount from version_rows where version_id = ? order by row_index').all(v.id) as { i: number; a: string; amount: string }[];
const events = sqlite.prepare("select step, chain_tx_hash as h from approval_events where version_id = ? and status = 'confirmed' and decision = 'approve' order by step").all(v.id) as { step: number; h: string }[];
const actions = sqlite.prepare("select kind, row_index as i, tx_hash as h from payout_actions where version_id = ? and status = 'succeeded' order by kind = 'pay_row', row_index").all(v.id) as { kind: string; i: number | null; h: string }[];
if (actions.filter((a) => a.kind === 'pay_row').length !== rows.length) throw new Error('not every payout is confirmed');
const maker = (sqlite.prepare("select chain_account_id as c from users u join payroll_runs r on r.maker_user_id = u.id where r.id = ?").get(runId) as { c: string }).c;
const worker = process.env.WORKER_ACCOUNT_ID ?? 'worker.sentfund-payroll.testnet';
const releaser = snapshot.releaseMode === 'maker' ? maker : worker;
closeDatabase();

const file = process.env.EVIDENCE_FILE ?? 'docs/evidence/testnet-runs.json';
const ev = JSON.parse(readFileSync(file, 'utf8')) as { runs: { runId: string }[] };
if (ev.runs.some((r) => r.runId === v.chain_run_id)) { console.log(`${v.chain_run_id} is already in ${file}`); process.exit(0); }
ev.runs.push({
  phase, label, vault: v.vault_contract_id, runId: v.chain_run_id, status: 'Paid', total: v.total,
  rows: rows.map((r) => ({ index: r.i, receiver: r.a, amount: r.amount })),
  txs: [
    { step: 'create_run (maker)', signer: maker, hash: v.submit_tx_hash },
    ...events.map((e) => ({ step: `approve (approver ${e.step})`, signer: snapshot.approvers[e.step - 1]!.chainAccountId, hash: e.h })),
    ...actions.map((a) => ({ step: a.kind === 'release' ? `start_release (${snapshot.releaseMode === 'maker' ? 'maker' : 'worker'})` : `pay_row ${a.i} (worker)`, signer: a.kind === 'release' ? releaser : worker, hash: a.h })),
  ],
} as unknown as { runId: string });
writeFileSync(file, `${JSON.stringify(ev, null, 2)}\n`);
console.log(`added ${v.chain_run_id} (${rows.length} rows, total ${v.total} base units) to ${file}; run npm run judge:verify`);
