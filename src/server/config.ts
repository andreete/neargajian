/**
 * Server configuration from the environment, validated once. Server-only: never import
 * from client components. The app refuses any network other than NEAR testnet.
 */
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
}

let cached: AppConfig | undefined;

export function loadConfig(env: Readonly<Record<string, string | undefined>> = process.env): AppConfig {
  const network = env.NEAR_NETWORK ?? 'testnet';
  if (network !== 'testnet') throw new Error('GAJIAN runs on NEAR testnet only (NEAR_NETWORK must be "testnet").');
  const baseUrl = new URL(env.APP_BASE_URL ?? 'http://127.0.0.1:8092');
  const production = env.NODE_ENV === 'production';
  const sessionSecret = env.SESSION_SECRET ?? '';
  const weakSecret = sessionSecret.length < 32 || sessionSecret === 'replace-with-random-secret';
  if (weakSecret && production) throw new Error('SESSION_SECRET must be at least 32 characters in production.');
  return {
    baseUrl,
    demoMode: env.DEMO_MODE === 'true',
    // Development/test fallback only; production refuses to start without a real secret.
    sessionSecret: weakSecret ? 'gajian-development-only-session-secret-0000' : sessionSecret,
    secureCookies: baseUrl.protocol === 'https:',
    network: 'testnet',
    explorerTxUrl: env.NEAR_EXPLORER_TX_URL ?? 'https://testnet.nearblocks.io/txns/',
    explorerAccountUrl: 'https://testnet.nearblocks.io/address/',
    vaultContractId: env.VAULT_CONTRACT_ID ?? 'vault2.gajian-payroll.testnet',
    tokenContractId: env.TUSDC_CONTRACT_ID ?? 'tusdc.gajian-payroll.testnet',
  };
}

export function getConfig(): AppConfig {
  cached ??= loadConfig();
  return cached;
}
