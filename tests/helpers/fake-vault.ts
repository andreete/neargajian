/**
 * Test-only stand-in for the vault contract (installed with setVaultClientForTests). It
 * enforces the same rules the real contract enforces (tested in contracts/vault) so the
 * app's lifecycle can be tested without testnet: creation, approval order, rejection,
 * cancellation/supersede, release reservation, one payout per row, outcomes.
 * Knobs simulate a proven failure, an unknown outcome that did or did not land, etc.
 */
import type { ChainRole, ChainWorkflow, TxOutcome, VaultClient, CallOptions } from '@/server/chain/vault-client';

type Status = 'PendingApproval' | 'Approved' | 'Rejected' | 'Cancelled' | 'Releasing' | 'Paid' | 'PartiallyPaid';
interface Run {
  maker: string; policy: { revision: number; kind: string; approvers: string[]; release_mode: string };
  row_count: number; total: string; payout_root: string; review_digest: string; status: Status;
  approvals: string[]; rejected_by: string | null; superseded_by: string | null;
  reserved: string; committed: string; paid: string; paid_count: number; in_flight_count: number;
}

export class FakeVault implements VaultClient {
  vaultId = 'vault2.gajian-payroll.testnet';
  wf: ChainWorkflow = { revision: 3, kind: 'TwoSequential', approvers: ['approver1.gajian-payroll.testnet', 'approver2.gajian-payroll.testnet'], release_mode: 'Automatic', maker: 'maker.gajian-payroll.testnet', worker: 'worker.gajian-payroll.testnet', max_row_amount: '1000000', max_run_total: '100000000' };
  runs = new Map<string, Run>();
  rows = new Map<string, { status: 'InFlight' | 'Paid' | 'Failed'; receiver_id: string; amount: string; attempts: number }>();
  balance = 1_000_000n;
  reserved = 0n;
  /** Ledger of successful transfers (receiver → total), to prove no double payment. */
  paidTo = new Map<string, bigint>();
  calls: { role: ChainRole; method: string; args: Record<string, unknown> }[] = [];
  outcomes = new Map<string, TxOutcome>();
  /** Next calls of a method: 'unknown-landed' applies but reports unknown; 'unknown-lost' never applies. */
  modes = new Map<string, 'unknown-landed' | 'unknown-lost'>();
  /** Receivers whose ft_transfer fails (e.g. not registered with the token). */
  unregistered = new Set<string>();
  /**
   * The chain's own clock: each landed transaction is included in a block 7 s after the
   * previous one, independent of the app's clock (so tests can tell the two apart).
   */
  chainClock = new Date('2026-11-10T12:00:00Z');
  blockTimes = new Map<string, Date>();
  /** When true, block lookups fail (RPC unavailable): txBlockTime returns null. */
  blockTimeUnavailable = false;
  private n = 0;
  private held = new Map<string, { signed: () => void; gate: Promise<void> }>();

  /**
   * The next call of `method` lands on-chain immediately, but its caller only gets the
   * outcome after `release()` (like a worker waiting for finality). `signed` resolves once
   * the transaction is signed and applied.
   */
  hold(method: string) {
    let release!: () => void;
    let signed!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const signedP = new Promise<void>((r) => { signed = r; });
    this.held.set(method, { signed, gate });
    return { signed: signedP, release };
  }

  accountFor(role: ChainRole) { return `${role}.gajian-payroll.testnet`; }

  async view<T>(method: string, args: Record<string, unknown>): Promise<T> {
    if (method === 'get_workflow') return structuredClone(this.wf) as T;
    if (method === 'get_run') return (this.runs.has(String(args.run_id)) ? structuredClone(this.runs.get(String(args.run_id))) : null) as T;
    if (method === 'get_row') return (this.rows.get(`${args.run_id}:${args.index}`) ?? null) as T;
    if (method === 'get_balances') return { total: this.balance.toString(), reserved: this.reserved.toString(), available: (this.balance - this.reserved).toString() } as T;
    throw new Error(`view ${method}`);
  }

  async txOutcome(txHash: string): Promise<TxOutcome> {
    return this.outcomes.get(txHash) ?? { txHash, status: 'unknown' };
  }

  async txBlockTime(txHash: string): Promise<Date | null> {
    if (this.blockTimeUnavailable) return null;
    return this.blockTimes.get(txHash) ?? null;
  }

  async call(role: ChainRole, method: string, args: Record<string, unknown>, opts: CallOptions = {}): Promise<TxOutcome> {
    this.n += 1;
    const txHash = `TX${this.n}`;
    this.calls.push({ role, method, args });
    opts.onSigned?.(txHash);
    const mode = this.modes.get(method);
    this.modes.delete(method);
    if (mode === 'unknown-lost') {
      this.outcomes.set(txHash, { txHash, status: 'failure', error: 'Transaction expired' });
      return { txHash, status: 'unknown' };
    }
    this.chainClock = new Date(this.chainClock.getTime() + 7000);
    this.blockTimes.set(txHash, this.chainClock);
    let result: TxOutcome;
    try {
      const value = this.apply(this.accountFor(role), method, args);
      result = { txHash, status: 'success', value };
    } catch (e) {
      result = { txHash, status: 'failure', error: (e as Error).message };
    }
    this.outcomes.set(txHash, result);
    const held = this.held.get(method);
    if (held) {
      this.held.delete(method);
      held.signed();
      await held.gate;
    }
    if (mode === 'unknown-landed') return { txHash, status: 'unknown' };
    return opts.waitUntil === 'INCLUDED' && result.status === 'success' ? { txHash, status: 'unknown' } : result;
  }

  private run(id: unknown): Run {
    const r = this.runs.get(String(id));
    if (!r) throw new Error('Run not found');
    return r;
  }

  private apply(caller: string, method: string, a: Record<string, unknown>): unknown {
    switch (method) {
      case 'create_run': {
        if (caller !== this.wf.maker) throw new Error('Only the maker can create runs');
        if (a.workflow_revision !== this.wf.revision) throw new Error('Workflow changed since review: reload and confirm again');
        if (this.runs.has(String(a.run_id))) throw new Error('Run already exists');
        if (a.supersedes) {
          const old = this.run(a.supersedes);
          if (old.status !== 'PendingApproval' && old.status !== 'Approved') throw new Error('Only a pending or approved run can be superseded');
          old.status = 'Cancelled';
          old.superseded_by = String(a.run_id);
        }
        this.runs.set(String(a.run_id), {
          maker: caller, policy: { revision: this.wf.revision, kind: this.wf.kind, approvers: [...this.wf.approvers], release_mode: this.wf.release_mode },
          row_count: Number(a.row_count), total: String(a.total), payout_root: String(a.payout_root), review_digest: String(a.review_digest),
          status: 'PendingApproval', approvals: [], rejected_by: null, superseded_by: null, reserved: '0', committed: '0', paid: '0', paid_count: 0, in_flight_count: 0,
        });
        return null;
      }
      case 'approve':
      case 'reject': {
        const r = this.run(a.run_id);
        if (r.status !== 'PendingApproval') throw new Error('Run is not waiting for approval');
        const step = r.policy.approvers.indexOf(caller);
        if (step < 0) throw new Error('Only an assigned approver can act on this run');
        if (r.approvals.includes(caller)) throw new Error('This approver already approved');
        if (r.policy.kind === 'TwoSequential' && step !== r.approvals.length) throw new Error('Approver 2 can act only after approver 1 approved');
        if (method === 'reject') { r.status = 'Rejected'; r.rejected_by = caller; return 'Rejected'; }
        r.approvals.push(caller);
        if (r.approvals.length === r.policy.approvers.length) r.status = 'Approved';
        return r.status;
      }
      case 'cancel_run': {
        const r = this.run(a.run_id);
        if (caller !== r.maker) throw new Error("Only the run's maker can cancel it");
        if (r.status !== 'PendingApproval' && r.status !== 'Approved') throw new Error('Only a pending or approved run can be cancelled');
        r.status = 'Cancelled';
        return 'Cancelled';
      }
      case 'start_release': {
        const r = this.run(a.run_id);
        const allowed = r.policy.release_mode === 'Automatic' ? this.wf.worker : r.maker;
        if (caller !== allowed) throw new Error(r.policy.release_mode === 'Automatic' ? 'Only the release worker can release this run (automatic release)' : 'Only the maker can release this run (maker release)');
        if (r.status !== 'Approved') throw new Error('Run is not approved for release');
        if (BigInt(r.total) > this.balance - this.reserved) throw new Error('Insufficient vault balance: awaiting funding');
        r.status = 'Releasing';
        r.reserved = r.total;
        this.reserved += BigInt(r.total);
        return 'Releasing';
      }
      case 'pay_row': {
        const r = this.run(a.run_id);
        if (caller !== this.wf.worker && !(r.policy.release_mode === 'Maker' && caller === r.maker)) throw new Error('Only the release worker (or the maker in maker release) can pay rows');
        if (r.status !== 'Releasing') throw new Error('Run is not releasing');
        const key = `${a.run_id}:${a.index}`;
        const prior = this.rows.get(key);
        if (prior?.status === 'InFlight') throw new Error('Row is already in flight');
        if (prior?.status === 'Paid') throw new Error('Row is already paid');
        const amount = BigInt(String(a.amount));
        if (BigInt(r.committed) + amount > BigInt(r.reserved)) throw new Error('Payout would exceed the reserved run total');
        const receiver = String(a.receiver_id);
        if (this.unregistered.has(receiver)) {
          this.rows.set(key, { status: 'Failed', receiver_id: receiver, amount: amount.toString(), attempts: (prior?.attempts ?? 0) + 1 });
          return false; // ft_transfer failed; the callback recorded a proven failure
        }
        this.rows.set(key, { status: 'Paid', receiver_id: receiver, amount: amount.toString(), attempts: (prior?.attempts ?? 0) + 1 });
        this.paidTo.set(receiver, (this.paidTo.get(receiver) ?? 0n) + amount);
        r.committed = (BigInt(r.committed) + amount).toString();
        r.paid = (BigInt(r.paid) + amount).toString();
        r.paid_count += 1;
        this.balance -= amount;
        this.reserved -= amount;
        if (r.paid_count === r.row_count) {
          this.reserved -= BigInt(r.reserved) - BigInt(r.paid);
          r.status = 'Paid';
        }
        return true;
      }
      default:
        throw new Error(`unsupported method ${method}`);
    }
  }
}
