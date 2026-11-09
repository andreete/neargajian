/**
 * NEAR testnet vault client (server-only). Signs function calls with the role's RESTRICTED
 * function-call key from the environment (never full-access keys), computes the transaction
 * hash locally and hands it to the caller BEFORE sending, so the hash can be persisted and an
 * uncertain outcome reconciled later. Outcomes are classified as:
 *   success  – final status SuccessValue/SuccessReceiptId
 *   failure  – final status Failure (proven: the contract or runtime rejected it)
 *   unknown  – no final outcome observed (timeout, network error): never treat as failure
 */
import { JsonRpcProvider, KeyPair, KeyPairSigner, actions, baseDecode, baseEncode, createTransaction, type KeyPairString } from 'near-api-js';

export type ChainRole = 'maker' | 'approver1' | 'approver2' | 'worker' | 'admin';

export interface TxOutcome {
  txHash: string;
  status: 'success' | 'failure' | 'unknown';
  value?: unknown;
  error?: string;
}

export interface ChainWorkflow {
  revision: number;
  kind: 'One' | 'TwoSequential' | 'TwoParallel';
  approvers: string[];
  release_mode: 'Automatic' | 'Maker';
  maker: string;
  worker: string;
  max_row_amount: string;
  max_run_total: string;
}

export interface VaultClient {
  vaultId: string;
  accountFor(role: ChainRole): string;
  view<T>(method: string, args: Record<string, unknown>): Promise<T>;
  call(role: ChainRole, method: string, args: Record<string, unknown>, opts?: { gasTgas?: number; onSigned?: (txHash: string) => void }): Promise<TxOutcome>;
  txOutcome(txHash: string, role: ChainRole): Promise<TxOutcome>;
}

const ENV_KEY: Record<ChainRole, { account: string; key: string }> = {
  maker: { account: 'MAKER_ACCOUNT_ID', key: 'MAKER_SIGNER_PRIVATE_KEY' },
  approver1: { account: 'APPROVER1_ACCOUNT_ID', key: 'APPROVER1_SIGNER_PRIVATE_KEY' },
  approver2: { account: 'APPROVER2_ACCOUNT_ID', key: 'APPROVER2_SIGNER_PRIVATE_KEY' },
  worker: { account: 'WORKER_ACCOUNT_ID', key: 'WORKER_SIGNER_PRIVATE_KEY' },
  admin: { account: 'ADMIN_SIGNER_ACCOUNT_ID', key: 'ADMIN_SIGNER_PRIVATE_KEY' },
};

interface RpcStatus { SuccessValue?: string; SuccessReceiptId?: string; Failure?: unknown }

function classify(txHash: string, status: RpcStatus | undefined): TxOutcome {
  if (!status) return { txHash, status: 'unknown' };
  if (status.Failure !== undefined) {
    const text = JSON.stringify(status.Failure);
    const panic = /Smart contract panicked: ([^"\\]+)/.exec(text)?.[1];
    return { txHash, status: 'failure', error: panic ?? text.slice(0, 300) };
  }
  if (status.SuccessValue !== undefined) {
    let value: unknown = null;
    if (status.SuccessValue) {
      try {
        value = JSON.parse(Buffer.from(status.SuccessValue, 'base64').toString('utf8'));
      } catch {
        value = status.SuccessValue;
      }
    }
    return { txHash, status: 'success', value };
  }
  if (status.SuccessReceiptId !== undefined) return { txHash, status: 'success', value: null };
  return { txHash, status: 'unknown' };
}

export class NearVaultClient implements VaultClient {
  readonly vaultId: string;
  private readonly provider: JsonRpcProvider;
  private readonly env: Readonly<Record<string, string | undefined>>;

  constructor(env: Readonly<Record<string, string | undefined>> = process.env) {
    if ((env.NEAR_NETWORK ?? 'testnet') !== 'testnet') throw new Error('testnet only');
    const url = env.NEAR_RPC_URL ?? 'https://rpc.testnet.fastnear.com';
    if (!/testnet/.test(url)) throw new Error('NEAR_RPC_URL must be a testnet endpoint');
    this.provider = new JsonRpcProvider({ url });
    this.vaultId = env.VAULT_CONTRACT_ID ?? 'vault.gajian-payroll.testnet';
    this.env = env;
  }

  accountFor(role: ChainRole): string {
    const account = this.env[ENV_KEY[role].account];
    if (!account || account.startsWith('replace-me')) throw new Error(`${ENV_KEY[role].account} is not configured`);
    return account;
  }

  private keyFor(role: ChainRole): KeyPair {
    const secret = this.env[ENV_KEY[role].key];
    if (!secret) throw new Error(`${ENV_KEY[role].key} is not configured (run scripts/testnet/write-env.mjs)`);
    return KeyPair.fromString(secret as KeyPairString);
  }

  async view<T>(method: string, args: Record<string, unknown>): Promise<T> {
    return (await this.provider.callFunction({ contractId: this.vaultId, method, args })) as T;
  }

  async call(role: ChainRole, method: string, args: Record<string, unknown>, opts: { gasTgas?: number; onSigned?: (txHash: string) => void } = {}): Promise<TxOutcome> {
    const accountId = this.accountFor(role);
    const keyPair = this.keyFor(role);
    const publicKey = keyPair.getPublicKey();
    const accessKey = await this.provider.viewAccessKey({ accountId, publicKey: publicKey.toString() });
    const block = await this.provider.viewBlock({ finality: 'final' });
    const gas = BigInt(opts.gasTgas ?? 50) * 10n ** 12n;
    const tx = createTransaction(accountId, publicKey, this.vaultId, BigInt(accessKey.nonce) + 1n,
      [actions.functionCall(method, args, gas, 0n)], baseDecode(block.header.hash));
    const { txHash, signedTransaction } = await new KeyPairSigner(keyPair).signTransaction(tx);
    const hash = baseEncode(txHash);
    opts.onSigned?.(hash); // persist before sending
    try {
      const res = await this.provider.sendTransactionUntil(signedTransaction, 'FINAL');
      return classify(hash, res.status as RpcStatus);
    } catch (error) {
      // The node may have rejected the transaction outright (invalid nonce, key not allowed)
      // or we may simply not know. Look it up once; if not found, the outcome is unknown.
      const looked = await this.txOutcome(hash, role).catch(() => ({ txHash: hash, status: 'unknown' as const }));
      if (looked.status !== 'unknown') return looked;
      const message = error instanceof Error ? error.message : String(error);
      const invalid = /InvalidTxError|InvalidNonce|MethodNameMismatch|NotEnoughAllowance|InvalidAccessKeyError|Expired/i.test(message);
      return invalid ? { txHash: hash, status: 'failure', error: message.slice(0, 300) } : { txHash: hash, status: 'unknown', error: message.slice(0, 300) };
    }
  }

  async txOutcome(txHash: string, role: ChainRole): Promise<TxOutcome> {
    try {
      const res = await this.provider.viewTransactionStatus({ txHash, accountId: this.accountFor(role), waitUntil: 'FINAL' });
      return classify(txHash, res.status as RpcStatus);
    } catch {
      return { txHash, status: 'unknown' };
    }
  }
}

let override: VaultClient | undefined;
let instance: VaultClient | undefined;

/** The process-wide vault client. Tests may install a stand-in; production never does. */
export function getVaultClient(): VaultClient {
  if (override) return override;
  instance ??= new NearVaultClient();
  return instance;
}

export function setVaultClientForTests(client: VaultClient | undefined): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('test-only');
  override = client;
}
