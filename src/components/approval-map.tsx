/**
 * Approval map (design system): one path for one reviewer, a sequence for two in order,
 * or two branches converging into a "Both approvals required" gate for parallel review,
 * then the release gate. Includes an ordered text summary for screen readers.
 */
export type MapKind = 'one' | 'two_sequential' | 'two_parallel';
export type MapRelease = 'automatic' | 'maker';

export interface MapApprover {
  name: string;
  status?: string;
  isMe?: boolean;
}

function Node({ label, name, status, isMe, release }: { label: string; name: string; status?: string | undefined; isMe?: boolean | undefined; release?: boolean }) {
  return (
    <div className={`am-node${isMe ? ' is-me' : ''}${release ? ' release' : ''}`}>
      <div className="am-label">{label}</div>
      <div className="am-name">{name}</div>
      {status ? <div className="am-status">{status}</div> : null}
    </div>
  );
}

const Edge = () => <div className="am-edge" aria-hidden="true" />;

export function ApprovalMap({ kind, releaseMode, approvers, compact = false, caption }: {
  kind: MapKind; releaseMode: MapRelease; approvers: MapApprover[]; compact?: boolean; caption?: string;
}) {
  const [a1, a2] = approvers;
  const release = releaseMode === 'automatic' ? 'Automatic release' : 'Maker releases';
  const releaseNote = releaseMode === 'automatic' ? 'Release worker pays' : 'Maker clicks Release';
  const summary = [
    'Maker submits the run.',
    kind === 'one' ? `${a1?.name ?? 'Approver 1'} approves.` : null,
    kind === 'two_sequential' ? `${a1?.name ?? 'Approver 1'} approves first, then ${a2?.name ?? 'Approver 2'}.` : null,
    kind === 'two_parallel' ? `${a1?.name ?? 'Approver 1'} and ${a2?.name ?? 'Approver 2'} approve in any order; both approvals are required.` : null,
    `${release}: the vault contract pays recipients only after final approval.`,
  ].filter(Boolean);

  return (
    <figure className="am-figure" aria-label={caption ?? 'Approval map'}>
      <div className={`approval-map${compact ? ' am-compact' : ''}`} aria-hidden="true">
        <Node label="Start" name="Maker submits" />
        <Edge />
        {kind === 'two_parallel' ? (
          <>
            <div className="am-parallel">
              <Node label="Approver" name={a1?.name ?? 'Approver 1'} status={a1?.status} isMe={a1?.isMe} />
              <Node label="Approver" name={a2?.name ?? 'Approver 2'} status={a2?.status} isMe={a2?.isMe} />
            </div>
            <Edge />
            <div className="am-gate">Both approvals<br />required</div>
          </>
        ) : (
          <>
            <Node label={kind === 'one' ? 'Approver' : 'Step 1'} name={a1?.name ?? 'Approver 1'} status={a1?.status} isMe={a1?.isMe} />
            {kind === 'two_sequential' ? (
              <>
                <Edge />
                <Node label="Step 2" name={a2?.name ?? 'Approver 2'} status={a2?.status} isMe={a2?.isMe} />
              </>
            ) : null}
          </>
        )}
        <Edge />
        <Node label="Release" name={release} status={releaseNote} release />
      </div>
      <figcaption className="sr-only">
        <ol>{summary.map((s) => <li key={s}>{s}</li>)}</ol>
      </figcaption>
    </figure>
  );
}
