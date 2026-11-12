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

/**
 * Phase 26 (QA-A2-07): SentFund pays on NEAR testnet only. A `.near` name is a mainnet account
 * (the mainnet registrar's top-level account); on testnet it would only fail at payout time.
 */
export function isMainnetAccountId(id: string): boolean {
  return id === 'near' || id.endsWith('.near');
}
export const MAINNET_ACCOUNT_MESSAGE = 'This is a mainnet account (.near). SentFund pays on NEAR testnet: use a .testnet account or a 64-character implicit account.';
