/**
 * Server configuration from the environment, validated once. Server-only: never import
 * from client components. The app refuses any network other than NEAR testnet.
 */
import { assertHostedKeys, cameraStandIn } from './hosted.ts';
import { faceTemplateKey } from './identity/face-template.ts';
export interface AppConfig {
  baseUrl: URL;
  demoMode: boolean;
  sessionSecret: string;
  secureCookies: boolean;
  network: 'testnet';
  explorerTxUrl: string;
  explorerAccountUrl: string;
  vaultContractId: string;
  tokenContractId: string;
  /**
   * The payroll signer keys (maker, approver 1, approver 2, worker) are configured. False on a
   * judge's local copy (read-only). The admin key is separate: the hosted demo never has it.
   */
  chainWritesEnabled: boolean;
  /** The admin signer key is configured (workflow changes). */
  adminWritesEnabled: boolean;
  /** Phase 24: FACE_TEMPLATE_KEY is set (encrypted face templates; the Payroll Advance face check). */
  faceTemplatesEnabled: boolean;
  /** Phase 24, TEST-ONLY: the browser tests' camera stand-in (synthetic specimen frames; never on a deployment). */
  cameraStandIn: boolean;
}

let cached: AppConfig | undefined;

export function loadConfig(env: Readonly<Record<string, string | undefined>> = process.env): AppConfig {
  assertHostedKeys(env);
  const network = env.NEAR_NETWORK ?? 'testnet';
  if (network !== 'testnet') throw new Error('SentFund runs on NEAR testnet only (NEAR_NETWORK must be "testnet").');
  const baseUrl = new URL(env.APP_BASE_URL ?? 'http://127.0.0.1:8092');
  const production = env.NODE_ENV === 'production';
  const sessionSecret = env.SESSION_SECRET ?? '';
  const weakSecret = sessionSecret.length < 32 || sessionSecret === 'replace-with-random-secret';
  if (weakSecret && production) throw new Error('SESSION_SECRET must be at least 32 characters in production.');
  // Throws on a malformed FACE_TEMPLATE_KEY, and on the camera stand-in outside a local test server.
  const faceKey = faceTemplateKey(env);
  const standIn = cameraStandIn(env);
  return {
    baseUrl,
    demoMode: env.DEMO_MODE === 'true',
    // Development/test fallback only; production refuses to start without a real secret.
    sessionSecret: weakSecret ? 'sentfund-development-only-session-secret-0000' : sessionSecret,
    secureCookies: baseUrl.protocol === 'https:',
    network: 'testnet',
    explorerTxUrl: env.NEAR_EXPLORER_TX_URL ?? 'https://testnet.nearblocks.io/txns/',
    explorerAccountUrl: 'https://testnet.nearblocks.io/address/',
    vaultContractId: env.VAULT_CONTRACT_ID ?? 'vault.sentfund-payroll.testnet',
    tokenContractId: env.TUSDC_CONTRACT_ID ?? 'tusdc.sentfund-payroll.testnet',
    // TEST-ONLY stand-in vault (browser tests, chain/standin.ts) signs nothing real but accepts writes.
    chainWritesEnabled: env.VAULT_STANDIN === 'browser-tests' || ['MAKER', 'APPROVER1', 'APPROVER2', 'WORKER'].every((r) => Boolean(env[`${r}_SIGNER_PRIVATE_KEY`])),
    adminWritesEnabled: Boolean(env.ADMIN_SIGNER_PRIVATE_KEY),
    faceTemplatesEnabled: faceKey !== null,
    cameraStandIn: standIn,
  };
}

export function getConfig(): AppConfig {
  cached ??= loadConfig();
  return cached;
}
