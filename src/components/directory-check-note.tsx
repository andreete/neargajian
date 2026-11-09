import { AlertIcon, CheckIcon, InfoIcon } from './icons';

/**
 * What approvers see about the recipient directory for a submitted version: the check frozen
 * at submission, plus a warning when a recipient was deactivated or its maximum lowered since.
 */
export function DirectoryCheckNote({ check, driftNow }: { check: { enforced: boolean; matched: number; rows: number } | null; driftNow: number }) {
  if (!check) {
    return <div className="callout" role="note" data-testid="directory-check"><InfoIcon size={18} /><span>Submitted before the recipient directory existed: rows were not checked against it.</span></div>;
  }
  if (!check.enforced) {
    return <div className="callout" role="note" data-testid="directory-check"><InfoIcon size={18} /><span>&ldquo;Pay registered recipients only&rdquo; was off when this version was submitted: {check.matched} of {check.rows} rows matched an active recipient within its maximum.{driftNow ? ` ${driftNow} row${driftNow === 1 ? '' : 's'} do not match the directory today.` : ''}</span></div>;
  }
  return (
    <div className={`callout ${driftNow ? 'callout-warn' : 'callout-ok'}`} role="note" data-testid="directory-check">
      {driftNow ? <AlertIcon size={18} /> : <CheckIcon size={18} />}
      <span>
        <strong>Every row matched the recipient directory:</strong> {check.matched} of {check.rows} rows matched an active recipient (same NEAR account) within that recipient&apos;s maximum, checked by the server at submission.
        {driftNow ? <> <strong>Changed since:</strong> {driftNow} row{driftNow === 1 ? ' no longer matches' : 's no longer match'} the directory today (recipient deactivated or maximum lowered). Check before approving.</> : null}
        {' '}This check is the app&apos;s and yours; the vault contract does not know the directory.
      </span>
    </div>
  );
}
