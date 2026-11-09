import { ApprovalMap, type MapApprover } from '@/components/approval-map';
import { ExternalIcon } from '@/components/icons';
import { getConfig } from '@/server/config';
import type { ActiveWorkflow } from '@/server/dashboard/queries';
import { formatTusdc, shortHash } from '@/lib/format';

export const KIND_LABEL = { one: 'One approver', two_sequential: 'Two approvers in sequence', two_parallel: 'Two approvers in parallel' } as const;
export const RELEASE_LABEL = { automatic: 'Automatic release', maker: 'Maker releases' } as const;

export function WorkflowPanel({ workflow, meId, title = 'Active approval path' }: { workflow: ActiveWorkflow | null; meId?: string; title?: string }) {
  if (!workflow) {
    return <section className="card"><div className="panel-title"><h2>{title}</h2></div><div className="panel-body muted">No active workflow. An admin must configure one.</div></section>;
  }
  const config = getConfig();
  const approvers: MapApprover[] = workflow.approvers.map((a) => ({ name: a.displayName, isMe: a.userId === meId }));
  return (
    <section className="card" aria-labelledby="wf-title">
      <div className="panel-title">
        <h2 id="wf-title">{title}</h2>
        <span className="chip chip-info">Revision {workflow.revision}</span>
      </div>
      <div className="panel-body stack">
        <ApprovalMap compact kind={workflow.kind} releaseMode={workflow.releaseMode} approvers={approvers} caption={`${KIND_LABEL[workflow.kind]}, ${RELEASE_LABEL[workflow.releaseMode]}`} />
        <dl className="kv">
          <dt>Policy</dt><dd>{KIND_LABEL[workflow.kind]}</dd>
          <dt>Release</dt><dd>{RELEASE_LABEL[workflow.releaseMode]}</dd>
          <dt>Per-row cap</dt><dd className="num">{formatTusdc(workflow.maxRowAmount)}</dd>
          <dt>Per-run cap</dt><dd className="num">{formatTusdc(workflow.maxRunTotal)}</dd>
          {workflow.chainTxHash ? (
            <><dt>Confirmed on-chain</dt><dd><a className="mono" href={`${config.explorerTxUrl}${workflow.chainTxHash}`} target="_blank" rel="noreferrer">{shortHash(workflow.chainTxHash)} <ExternalIcon size={12} /><span className="sr-only">(opens NearBlocks)</span></a></dd></>
          ) : null}
        </dl>
      </div>
    </section>
  );
}

export function SignerPanel({ account }: { account: string | null }) {
  const config = getConfig();
  return (
    <section className="card" aria-labelledby="signer-title">
      <div className="panel-title"><h2 id="signer-title">Your chain identity</h2></div>
      <div className="panel-body stack">
        <dl className="kv">
          <dt>Signer account</dt>
          <dd>{account ? <a className="mono" href={`${config.explorerAccountUrl}${account}`} target="_blank" rel="noreferrer">{account}</a> : '—'}</dd>
          <dt>Network</dt><dd>NEAR testnet</dd>
        </dl>
        <p className="muted">The server signs your actions with a restricted key that can only call your role&apos;s vault methods.</p>
      </div>
    </section>
  );
}
