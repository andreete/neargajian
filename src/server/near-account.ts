/**
 * NEAR account ID syntax (same rules as near-sdk / nearcore `AccountId` validation):
 * 2–64 characters; lowercase letters, digits and the separators `-`, `_`, `.`;
 * no separator at the start or end and no two separators in a row.
 * Syntax only: whether the account exists and is registered with tUSDC is checked
 * separately before payout.
 */
const ACCOUNT_ID_RE = /^(?:[a-z\d]+[-_])*[a-z\d]+(?:\.(?:[a-z\d]+[-_])*[a-z\d]+)*$/;

export const MIN_ACCOUNT_ID_LEN = 2;
export const MAX_ACCOUNT_ID_LEN = 64;

export function isValidAccountId(id: string): boolean {
  return id.length >= MIN_ACCOUNT_ID_LEN && id.length <= MAX_ACCOUNT_ID_LEN && ACCOUNT_ID_RE.test(id);
}
