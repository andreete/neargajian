/**
 * The vault contract this app instance works with (VAULT_CONTRACT_ID). Workflow revisions and
 * submitted versions record their vault, so a vault switch (Phase 16) keeps older runs readable
 * and never mixes revisions or reconciles a version against the wrong contract.
 */
import { and, eq } from 'drizzle-orm';
import { workflowConfigs } from '../db/schema.ts';

/** The final vault (Phase 16). Versions and revisions recorded before the switch keep 'vault.gajian-payroll.testnet'. */
export const DEFAULT_VAULT = 'vault2.gajian-payroll.testnet';

export function currentVaultId(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return env.VAULT_CONTRACT_ID || DEFAULT_VAULT;
}

/** The active workflow revision of the configured vault. */
export function activeWorkflowWhere() {
  return and(eq(workflowConfigs.chainStatus, 'active'), eq(workflowConfigs.vaultContractId, currentVaultId()));
}
