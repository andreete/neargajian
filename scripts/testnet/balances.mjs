#!/usr/bin/env node
// Prints public NEAR balances (and tUSDC balances once the token is deployed) for the
// GAJIAN testnet accounts. Read-only RPC queries; no keys involved.
// Usage: node scripts/testnet/balances.mjs [master-account]
const RPC = process.env.NEAR_RPC_URL ?? 'https://rpc.testnet.fastnear.com';
if (!RPC.includes('testnet')) throw new Error('testnet RPC only');
const master = process.argv[2] ?? 'gajian-payroll.testnet';
const roles = ['', 'tusdc', 'vault', 'admin', 'maker', 'approver1', 'approver2', 'worker',
  'recipient1', 'recipient2', 'recipient3'];

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'gajian', method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(JSON.stringify(body.error));
  return body.result;
}

const fmtNear = (yocto) => {
  const s = BigInt(yocto).toString().padStart(25, '0');
  return `${s.slice(0, -24)}.${s.slice(-24, -19)}`;
};
const fmtUsdc = (base) => {
  const s = BigInt(base).toString().padStart(7, '0');
  return `${s.slice(0, -6)}.${s.slice(-6)}`;
};

const token = `tusdc.${master}`;
let tokenLive = true;
let totalNear = 0n;
for (const role of roles) {
  const id = role ? `${role}.${master}` : master;
  let line = id.padEnd(36);
  try {
    const acc = await rpc('query', { request_type: 'view_account', finality: 'final', account_id: id });
    totalNear += BigInt(acc.amount) + BigInt(acc.locked);
    line += ` ${fmtNear(acc.amount).padStart(10)} NEAR  storage ${String(acc.storage_usage).padStart(7)} B`;
  } catch {
    line += ' (does not exist)';
  }
  if (tokenLive) {
    try {
      const r = await rpc('query', {
        request_type: 'call_function', finality: 'final', account_id: token,
        method_name: 'ft_balance_of', args_base64: Buffer.from(JSON.stringify({ account_id: id })).toString('base64'),
      });
      line += `  ${fmtUsdc(JSON.parse(Buffer.from(r.result).toString())).padStart(12)} tUSDC`;
    } catch {
      tokenLive = false;
    }
  }
  console.log(line);
}
console.log(`total NEAR across accounts: ${fmtNear(totalNear)}`);
