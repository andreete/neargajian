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

/**
 * What approvers see about the identity check (Phase 21): the result frozen at submission (how
 * many rows paid an identity-verified recipient), plus a warning when that changed since.
 */
export function IdentityCheckNote({ check, rows, unverifiedNow }: { check: { enforced: boolean; verified: number } | null | undefined; rows: number; unverifiedNow: number }) {
  if (!check) return null;
  if (!check.enforced) {
    return <div className="callout" role="note" data-testid="identity-check"><InfoIcon size={18} /><span>&ldquo;Pay identity-verified recipients only&rdquo; was off when this version was submitted: {check.verified} of {rows} rows paid an identity-verified recipient.{unverifiedNow ? ` ${unverifiedNow} row${unverifiedNow === 1 ? '' : 's'} pay someone not verified today.` : ''}</span></div>;
  }
  return (
    <div className={`callout ${unverifiedNow ? 'callout-warn' : 'callout-ok'}`} role="note" data-testid="identity-check">
      {unverifiedNow ? <AlertIcon size={18} /> : <CheckIcon size={18} />}
      <span>
        <strong>Every recipient passed the identity check:</strong> {check.verified} of {rows} rows pay a recipient whose KTP and face photo were verified, checked by the server at submission.
        {unverifiedNow ? <> <strong>Changed since:</strong> {unverifiedNow} row{unverifiedNow === 1 ? ' pays' : 's pay'} someone whose verification was withdrawn or failed a new check. Check before approving.</> : null}
      </span>
    </div>
  );
}
