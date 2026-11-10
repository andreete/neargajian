/**
 * SentFund database schema (SQLite via better-sqlite3 + Drizzle; PostgreSQL-portable shapes).
 *
 * Money: tUSDC base units stored as canonical decimal TEXT (never floats, never JS numbers).
 * Time: integer milliseconds since the epoch.
 * Immutability of submitted versions, their rows and payout-action uniqueness are enforced
 * by triggers and partial indexes in db/migrations/0001_integrity.sql.
 */
import { sql } from 'drizzle-orm';
import { check, customType, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Base units as canonical decimal text ↔ bigint. */
export const units = customType<{ data: bigint; driverData: string }>({
  dataType: () => 'text',
  toDriver: (value) => {
    if (typeof value !== 'bigint' || value < 0n) throw new RangeError('units must be a non-negative bigint');
    return value.toString();
  },
  fromDriver: (value) => {
    if (!/^(0|[1-9]\d*)$/.test(value)) throw new RangeError('corrupt units value in database');
    return BigInt(value);
  },
});

const ms = (name: string) => integer(name, { mode: 'timestamp_ms' });

export const ROLES = ['maker', 'approver', 'admin', 'employee'] as const;
export type Role = (typeof ROLES)[number];
export const WORKFLOW_KINDS = ['one', 'two_sequential', 'two_parallel'] as const;
export type WorkflowKind = (typeof WORKFLOW_KINDS)[number];
export const RELEASE_MODES = ['automatic', 'maker'] as const;
export type ReleaseMode = (typeof RELEASE_MODES)[number];
export const POSTING_MODES = ['consolidated', 'detailed'] as const;
export const RUN_KINDS = ['payroll', 'advance'] as const;
export type RunKind = (typeof RUN_KINDS)[number];
export type PostingMode = (typeof POSTING_MODES)[number];
export const VERSION_STATUSES = [
  'submitting', 'submit_failed', 'pending_approval', 'approved', 'rejected', 'cancelled',
  'releasing', 'paid', 'partially_paid',
] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];
export const PAYOUT_ACTION_KINDS = ['release', 'pay_row'] as const;
export const PAYOUT_ACTION_STATUSES = ['claimed', 'submitted', 'succeeded', 'failed', 'unknown'] as const;
export type PayoutActionStatus = (typeof PAYOUT_ACTION_STATUSES)[number];

const inList = (column: string, values: readonly string[]) =>
  sql.raw(`${column} IN (${values.map((v) => `'${v}'`).join(', ')})`);

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role', { enum: ROLES }).notNull(),
  passwordHash: text('password_hash').notNull(),
  /** NEAR testnet account this user's chain actions are signed as (server-held restricted key). */
  chainAccountId: text('chain_account_id'),
  createdAt: ms('created_at').notNull(),
  disabledAt: ms('disabled_at'),
  /** Employee role only (Phase 23): the one directory recipient this user is. */
  recipientId: text('recipient_id'),
}, (t) => [
  uniqueIndex('users_email_uq').on(t.email),
  uniqueIndex('users_chain_account_uq').on(t.chainAccountId),
  uniqueIndex('users_recipient_uq').on(t.recipientId),
  check('users_role_ck', inList('role', ROLES)),
  check('users_email_lower_ck', sql`email = lower(email)`),
  check('users_employee_recipient_ck', sql`(role = 'employee') = (recipient_id IS NOT NULL)`),
]);

export const sessions = sqliteTable('sessions', {
  /** SHA-256 (hex) of the session token; the token itself only lives in the cookie. */
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  csrfToken: text('csrf_token').notNull(),
  createdAt: ms('created_at').notNull(),
  lastSeenAt: ms('last_seen_at').notNull(),
  expiresAt: ms('expires_at').notNull(),
}, (t) => [index('sessions_user_ix').on(t.userId), index('sessions_expires_ix').on(t.expiresAt)]);

/** Login rate limiting. Stores salted hashes of email and client address, never the raw values. */
export const loginAttempts = sqliteTable('login_attempts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  emailHash: text('email_hash').notNull(),
  clientHash: text('client_hash').notNull(),
  succeeded: integer('succeeded', { mode: 'boolean' }).notNull(),
  attemptedAt: ms('attempted_at').notNull(),
}, (t) => [
  index('login_attempts_email_ix').on(t.emailHash, t.attemptedAt),
  index('login_attempts_client_ix').on(t.clientHash, t.attemptedAt),
]);

/** Security and workflow audit trail. `detail` is JSON without PII. */
export const auditEvents = sqliteTable('audit_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  at: ms('at').notNull(),
  actorUserId: text('actor_user_id').references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  detail: text('detail'),
}, (t) => [index('audit_events_at_ix').on(t.at)]);

/** Approval workflow revisions; mirrors the vault's on-chain workflow revision. */
export const workflowConfigs = sqliteTable('workflow_configs', {
  id: text('id').primaryKey(),
  revision: integer('revision').notNull(),
  kind: text('kind', { enum: WORKFLOW_KINDS }).notNull(),
  approver1UserId: text('approver1_user_id').notNull().references(() => users.id),
  approver2UserId: text('approver2_user_id').references(() => users.id),
  releaseMode: text('release_mode', { enum: RELEASE_MODES }).notNull(),
  maxRowAmount: units('max_row_amount').notNull(),
  maxRunTotal: units('max_run_total').notNull(),
  /** pending → active (confirmed on-chain) or failed; superseded when a newer one activates. */
  chainStatus: text('chain_status', { enum: ['pending', 'active', 'failed', 'superseded'] }).notNull(),
  chainTxHash: text('chain_tx_hash'),
  /** The vault contract this revision lives in (revisions restart at 1 in a new vault). */
  vaultContractId: text('vault_contract_id').notNull().default('vault.gajian-payroll.testnet'),
  createdByUserId: text('created_by_user_id').notNull().references(() => users.id),
  createdAt: ms('created_at').notNull(),
  activatedAt: ms('activated_at'),
}, (t) => [
  // Failed attempts keep their row (audit) and do not block a retry of the same revision.
  uniqueIndex('workflow_configs_revision_uq').on(t.vaultContractId, t.revision).where(sql`chain_status <> 'failed'`),
  check('workflow_configs_kind_ck', inList('kind', WORKFLOW_KINDS)),
  check('workflow_configs_release_ck', inList('release_mode', RELEASE_MODES)),
  check('workflow_configs_status_ck', inList('chain_status', ['pending', 'active', 'failed', 'superseded'])),
  check('workflow_configs_approvers_ck', sql`(kind = 'one' AND approver2_user_id IS NULL) OR (kind <> 'one' AND approver2_user_id IS NOT NULL AND approver2_user_id <> approver1_user_id)`),
]);

/** A payroll run owned by one maker. Holds the editable draft; submissions are versions. */
export const payrollRuns = sqliteTable('payroll_runs', {
  id: text('id').primaryKey(),
  makerUserId: text('maker_user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  postingMode: text('posting_mode', { enum: POSTING_MODES }).notNull(),
  source: text('source', { enum: ['manual', 'upload'] }).notNull(),
  /** Incremented on every draft replacement (optimistic concurrency). */
  draftRevision: integer('draft_revision').notNull().default(0),
  draftFilename: text('draft_filename'),
  draftFileSha256: text('draft_file_sha256'),
  createdAt: ms('created_at').notNull(),
  updatedAt: ms('updated_at').notNull(),
  /** Set when the payroll assistant drafted this run: the request it was drafted from (set once, trigger). */
  assistantRequestId: text('assistant_request_id'),
  /** The maker's own words (one line per message), shown as "Drafted by the payroll assistant from: …". */
  assistantRequestText: text('assistant_request_text'),
  /** payroll = an ordinary run; advance = the one-row run that pays a Payroll Advance (Phase 23). */
  kind: text('kind', { enum: RUN_KINDS }).notNull().default('payroll'),
  /** The Payroll Advance this run pays (kind = advance only, set once). */
  advanceId: text('advance_id'),
}, (t) => [
  index('payroll_runs_maker_ix').on(t.makerUserId),
  uniqueIndex('payroll_runs_advance_uq').on(t.advanceId),
  check('payroll_runs_posting_ck', inList('posting_mode', POSTING_MODES)),
  check('payroll_runs_source_ck', inList('source', ['manual', 'upload'])),
  check('payroll_runs_kind_ck', sql`(kind = 'payroll' AND advance_id IS NULL) OR (kind = 'advance' AND advance_id IS NOT NULL)`),
]);

/** Editable draft rows: raw values as entered or imported, in order. */
export const draftRows = sqliteTable('draft_rows', {
  runId: text('run_id').notNull().references(() => payrollRuns.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  nearAccountId: text('near_account_id').notNull(),
  receiverName: text('receiver_name').notNull(),
  currency: text('currency').notNull(),
  amount: text('amount').notNull(),
  mobilePhone: text('mobile_phone').notNull(),
  email: text('email').notNull(),
  /** First physical line of the record in the uploaded file (uploads only). */
  sourceLine: integer('source_line'),
}, (t) => [primaryKey({ columns: [t.runId, t.position] })]);

/** Immutable submitted version: the exact reviewed snapshot and its commitments. */
export const runVersions = sqliteTable('run_versions', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => payrollRuns.id),
  versionNo: integer('version_no').notNull(),
  /** Deterministic vault run_id (idempotent create_run). */
  chainRunId: text('chain_run_id').notNull(),
  /** The vault contract this version was submitted to. */
  vaultContractId: text('vault_contract_id').notNull().default('vault.gajian-payroll.testnet'),
  postingMode: text('posting_mode', { enum: POSTING_MODES }).notNull(),
  workflowRevision: integer('workflow_revision').notNull(),
  /** JSON snapshot: kind, release mode, approver user IDs and chain accounts, caps. */
  workflowSnapshot: text('workflow_snapshot').notNull(),
  rowCount: integer('row_count').notNull(),
  total: units('total').notNull(),
  payoutRoot: text('payout_root').notNull(),
  reviewDigest: text('review_digest').notNull(),
  /** Server-only salt of the review digest (never on-chain, never sent to browsers). */
  reviewSalt: text('review_salt').notNull(),
  sourceFilename: text('source_filename'),
  sourceSha256: text('source_sha256'),
  createdByUserId: text('created_by_user_id').notNull().references(() => users.id),
  createdAt: ms('created_at').notNull(),
  status: text('status', { enum: VERSION_STATUSES }).notNull(),
  statusUpdatedAt: ms('status_updated_at').notNull(),
  submitTxHash: text('submit_tx_hash'),
  supersededByVersionId: text('superseded_by_version_id'),
  /** Human-readable reason for submit_failed / cancellation problems (no PII). */
  statusDetail: text('status_detail'),
  /**
   * Recipient-directory check at submission (JSON {enforced, matched, rows}); set once at insert
   * (trigger). Shows approvers that every row matched an active recipient within its maximum.
   */
  directoryCheck: text('directory_check'),
}, (t) => [
  uniqueIndex('run_versions_run_no_uq').on(t.runId, t.versionNo),
  uniqueIndex('run_versions_chain_run_uq').on(t.chainRunId),
  index('run_versions_status_ix').on(t.status),
  check('run_versions_status_ck', inList('status', VERSION_STATUSES)),
  check('run_versions_rows_ck', sql`row_count BETWEEN 1 AND 1000`),
  check('run_versions_root_ck', sql`length(payout_root) = 64 AND length(review_digest) = 64 AND length(review_salt) = 64`),
]);

/** Ordered, immutable rows of a version (index = Merkle leaf index). */
export const versionRows = sqliteTable('version_rows', {
  versionId: text('version_id').notNull().references(() => runVersions.id),
  rowIndex: integer('row_index').notNull(),
  nearAccountId: text('near_account_id').notNull(),
  receiverName: text('receiver_name').notNull(),
  currency: text('currency').notNull(),
  amount: units('amount').notNull(),
  mobilePhone: text('mobile_phone').notNull(),
  email: text('email').notNull(),
  sourceLine: integer('source_line'),
}, (t) => [
  primaryKey({ columns: [t.versionId, t.rowIndex] }),
  index('version_rows_account_ix').on(t.nearAccountId),
]);

/** One approval or rejection per approver per version; confirmed only after the chain says so. */
export const approvalEvents = sqliteTable('approval_events', {
  id: text('id').primaryKey(),
  versionId: text('version_id').notNull().references(() => runVersions.id),
  approverUserId: text('approver_user_id').notNull().references(() => users.id),
  step: integer('step').notNull(),
  decision: text('decision', { enum: ['approve', 'reject'] }).notNull(),
  /** Rejection reason (off-chain only). */
  reason: text('reason'),
  status: text('status', { enum: ['pending', 'confirmed', 'failed'] }).notNull(),
  chainTxHash: text('chain_tx_hash'),
  /** Contract or network error when status = failed. */
  error: text('error'),
  createdAt: ms('created_at').notNull(),
  confirmedAt: ms('confirmed_at'),
}, (t) => [
  index('approval_events_version_ix').on(t.versionId),
  check('approval_events_step_ck', sql`step IN (1, 2)`),
  check('approval_events_decision_ck', inList('decision', ['approve', 'reject'])),
  check('approval_events_status_ck', inList('status', ['pending', 'confirmed', 'failed'])),
  check('approval_events_reason_ck', sql`decision = 'approve' OR (reason IS NOT NULL AND length(trim(reason)) > 0)`),
]);

/**
 * Chain actions of the release worker / maker release. The ID is deterministic
 * (`<chain_run_id>:<kind>:<row_index or ->:<attempt>`) and persisted BEFORE the transaction
 * is sent. At most one live (non-failed) action per version/kind/row (partial unique index).
 */
export const payoutActions = sqliteTable('payout_actions', {
  id: text('id').primaryKey(),
  versionId: text('version_id').notNull().references(() => runVersions.id),
  kind: text('kind', { enum: PAYOUT_ACTION_KINDS }).notNull(),
  rowIndex: integer('row_index'),
  attempt: integer('attempt').notNull(),
  status: text('status', { enum: PAYOUT_ACTION_STATUSES }).notNull(),
  workerId: text('worker_id').notNull(),
  leaseExpiresAt: ms('lease_expires_at').notNull(),
  txHash: text('tx_hash'),
  error: text('error'),
  createdAt: ms('created_at').notNull(),
  updatedAt: ms('updated_at').notNull(),
  /**
   * Timestamp of the block that includes this action's transaction (what the explorer shows):
   * the paid time of a payout. Set once from the chain at confirmation, never changed (trigger).
   */
  chainBlockTime: ms('chain_block_time'),
}, (t) => [
  index('payout_actions_version_ix').on(t.versionId),
  check('payout_actions_kind_ck', inList('kind', PAYOUT_ACTION_KINDS)),
  check('payout_actions_status_ck', inList('status', PAYOUT_ACTION_STATUSES)),
  check('payout_actions_row_ck', sql`(kind = 'release' AND row_index IS NULL) OR (kind = 'pay_row' AND row_index >= 0)`),
  check('payout_actions_attempt_ck', sql`attempt >= 1`),
]);

/** Company posting entries with opaque references (derived from confirmed payouts, Phase 13). */
export const reportEntries = sqliteTable('report_entries', {
  id: text('id').primaryKey(),
  versionId: text('version_id').notNull().references(() => runVersions.id),
  postingMode: text('posting_mode', { enum: POSTING_MODES }).notNull(),
  reference: text('reference').notNull(),
  /** Null for the single consolidated entry; the row index for detailed entries. */
  rowIndex: integer('row_index'),
  amount: units('amount').notNull(),
  currency: text('currency').notNull(),
  createdAt: ms('created_at').notNull(),
}, (t) => [
  uniqueIndex('report_entries_reference_uq').on(t.reference),
  uniqueIndex('report_entries_version_row_uq').on(t.versionId, t.rowIndex),
  check('report_entries_posting_ck', inList('posting_mode', POSTING_MODES)),
]);

/**
 * Imported testnet history: real runs executed on NEAR testnet by the Phase 02/04 scripts
 * before the app existed (db/seed/testnet-history.json, read from the chain by
 * scripts/testnet/export-history.mjs). Kept apart from app versions because they have no
 * app review snapshot or salt. Shown in the UI with a "Testnet run" label.
 */
export const testnetRuns = sqliteTable('testnet_runs', {
  id: text('id').primaryKey(), // the vault run_id
  vaultAccount: text('vault_account').notNull(),
  vaultGeneration: text('vault_generation').notNull(),
  title: text('title').notNull(),
  /** payroll = a payroll run; operations = a treasury transfer through the vault (excluded from payroll counts and totals). */
  category: text('category', { enum: ['payroll', 'operations'] }).notNull().default('payroll'),
  makerUserId: text('maker_user_id').references(() => users.id),
  kind: text('kind', { enum: WORKFLOW_KINDS }).notNull(),
  releaseMode: text('release_mode', { enum: RELEASE_MODES }).notNull(),
  approverAccounts: text('approver_accounts').notNull(), // JSON array of chain accounts
  status: text('status', { enum: ['paid', 'rejected', 'incomplete'] }).notNull(),
  rejectionReason: text('rejection_reason'),
  rowCount: integer('row_count').notNull(),
  total: units('total').notNull(),
  payoutRoot: text('payout_root'),
  reviewDigest: text('review_digest'),
  createdAt: ms('created_at').notNull(),
  createdTxHash: text('created_tx_hash').notNull(),
}, (t) => [
  check('testnet_runs_status_ck', inList('status', ['paid', 'rejected', 'incomplete'])),
  check('testnet_runs_category_ck', inList('category', ['payroll', 'operations'])),
  index('testnet_runs_maker_ix').on(t.makerUserId),
]);

export const testnetRunRows = sqliteTable('testnet_run_rows', {
  runId: text('run_id').notNull().references(() => testnetRuns.id),
  rowIndex: integer('row_index').notNull(),
  receiverAccount: text('receiver_account').notNull(),
  amount: units('amount').notNull(),
  paidTxHash: text('paid_tx_hash'),
  paidAt: ms('paid_at'),
}, (t) => [primaryKey({ columns: [t.runId, t.rowIndex] })]);

export const testnetRunEvents = sqliteTable('testnet_run_events', {
  runId: text('run_id').notNull().references(() => testnetRuns.id),
  seq: integer('seq').notNull(),
  txHash: text('tx_hash').notNull(),
  signerAccount: text('signer_account').notNull(),
  method: text('method').notNull(),
  rowIndex: integer('row_index'),
  success: integer('success', { mode: 'boolean' }).notNull(),
  error: text('error'),
  at: ms('at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.runId, t.seq] }),
  uniqueIndex('testnet_run_events_tx_uq').on(t.txHash),
  index('testnet_run_events_signer_ix').on(t.signerAccount),
]);

/**
 * Recipient directory (Phase 19): who may be paid when "Pay registered recipients only" is on.
 * Never deleted (deactivated instead, trigger), so history stays readable. Every change is
 * logged in recipient_events with who and when.
 */
export const IDENTITY_STATUSES = ['unverified', 'verified', 'needs_review', 'failed'] as const;
export type IdentityStatus = (typeof IDENTITY_STATUSES)[number];

export const RECIPIENT_READINESS = ['unchecked', 'ready', 'no_account', 'not_registered', 'check_failed'] as const;
export type RecipientReadiness = (typeof RECIPIENT_READINESS)[number];

export const recipients = sqliteTable('recipients', {
  id: text('id').primaryKey(),
  nearAccountId: text('near_account_id').notNull(),
  name: text('name').notNull(),
  division: text('division').notNull(),
  email: text('email').notNull(),
  mobilePhone: text('mobile_phone').notNull(),
  /** Maximum per payout in base units (never above the workflow's per-row cap). */
  maxAmount: units('max_amount').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull(),
  /** One of the 1,000 synthetic sample employees (import check only, accounts not on testnet). */
  sample: integer('sample', { mode: 'boolean' }).notNull().default(false),
  /** Read-only testnet check: account exists and is registered with tUSDC. */
  readiness: text('readiness', { enum: RECIPIENT_READINESS }).notNull().default('unchecked'),
  readinessCheckedAt: ms('readiness_checked_at'),
  /** Identity check (Phase 21): KTP read + face match. Set only by identity_checks (service). */
  identityStatus: text('identity_status', { enum: IDENTITY_STATUSES }).notNull().default('unverified'),
  identityCheckedAt: ms('identity_checked_at'),
  identityCheckId: text('identity_check_id'),
  /** Masked NIK (first 4 + last 4 digits) and its keyed hash, from the latest check; never the NIK. */
  nikMasked: text('nik_masked'),
  nikHash: text('nik_hash'),
  /** Payroll Advance (Phase 23): monthly net pay in base units and the start date (YYYY-MM-DD). */
  monthlyNetPay: units('monthly_net_pay'),
  startDate: text('start_date'),
  createdByUserId: text('created_by_user_id').notNull().references(() => users.id),
  createdAt: ms('created_at').notNull(),
  updatedByUserId: text('updated_by_user_id').notNull().references(() => users.id),
  updatedAt: ms('updated_at').notNull(),
}, (t) => [
  uniqueIndex('recipients_account_uq').on(t.nearAccountId),
  index('recipients_division_ix').on(t.division),
  check('recipients_account_lower_ck', sql`near_account_id = lower(near_account_id)`),
  check('recipients_readiness_ck', inList('readiness', RECIPIENT_READINESS)),
  check('recipients_identity_status_ck', inList('identity_status', IDENTITY_STATUSES)),
  index('recipients_nik_hash_ix').on(t.nikHash),
]);

export const RECIPIENT_EVENT_ACTIONS = ['created', 'updated', 'deactivated', 'reactivated', 'readiness_checked'] as const;
export type RecipientEventAction = (typeof RECIPIENT_EVENT_ACTIONS)[number];

/** Append-only change log of the directory: who, when, what (field → [before, after]). */
export const recipientEvents = sqliteTable('recipient_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipientId: text('recipient_id').notNull().references(() => recipients.id),
  actorUserId: text('actor_user_id').notNull().references(() => users.id),
  at: ms('at').notNull(),
  action: text('action', { enum: RECIPIENT_EVENT_ACTIONS }).notNull(),
  /** form | import | seed | check */
  source: text('source').notNull(),
  /** JSON object: field → [before, after] (amounts as base-unit strings). */
  changes: text('changes').notNull(),
}, (t) => [
  index('recipient_events_recipient_ix').on(t.recipientId, t.at),
  index('recipient_events_at_ix').on(t.at),
  check('recipient_events_action_ck', inList('action', RECIPIENT_EVENT_ACTIONS)),
]);

/** Admin settings (key → value). Changes are audited in audit_events. */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedByUserId: text('updated_by_user_id').references(() => users.id),
  updatedAt: ms('updated_at').notNull(),
});

export const ASSISTANT_OUTCOMES = ['preview', 'question', 'refused', 'error', 'created'] as const;
export type AssistantOutcome = (typeof ASSISTANT_OUTCOMES)[number];

/**
 * Payroll assistant requests (Phase 19): one row per model call (also the hourly rate limit).
 * Holds the maker's text and the model's structured answer, never directory data.
 */
export const assistantRequests = sqliteTable('assistant_requests', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  createdAt: ms('created_at').notNull(),
  /** The maker's messages, one per line (follow-up answers appended). */
  requestText: text('request_text').notNull(),
  outcome: text('outcome', { enum: ASSISTANT_OUTCOMES }).notNull(),
  /** JSON: the model's structured draft request (validated) or null. */
  structured: text('structured'),
  message: text('message'),
  model: text('model'),
  /** The draft created from this preview (once). */
  runId: text('run_id').references(() => payrollRuns.id),
}, (t) => [
  index('assistant_requests_user_ix').on(t.userId, t.createdAt),
  uniqueIndex('assistant_requests_run_uq').on(t.runId),
  check('assistant_requests_outcome_ck', inList('outcome', ASSISTANT_OUTCOMES)),
]);

export const IDENTITY_OUTCOMES = ['verified', 'needs_review', 'failed'] as const;
export type IdentityOutcome = (typeof IDENTITY_OUTCOMES)[number];
export const IDENTITY_SOURCES = ['upload', 'specimen', 'seed', 'manual_review'] as const;
export type IdentitySource = (typeof IDENTITY_SOURCES)[number];

/**
 * Identity checks (Phase 21): one row per check, append-only (trigger). Results only: the KTP and
 * face images are processed in memory and discarded; the NIK is kept masked plus a keyed hash.
 * dry_run = 1: a public-demo check on the synthetic specimens that did not change the recipient.
 */
export const identityChecks = sqliteTable('identity_checks', {
  id: text('id').primaryKey(),
  recipientId: text('recipient_id').notNull().references(() => recipients.id),
  actorUserId: text('actor_user_id').notNull().references(() => users.id),
  at: ms('at').notNull(),
  source: text('source', { enum: IDENTITY_SOURCES }).notNull(),
  dryRun: integer('dry_run', { mode: 'boolean' }).notNull().default(false),
  outcome: text('outcome', { enum: IDENTITY_OUTCOMES }).notNull(),
  nikMasked: text('nik_masked'),
  nikHash: text('nik_hash'),
  /** Cosine similarity of the KTP photo and the face photo (SFace), when both faces were found. */
  faceScore: real('face_score'),
  /** JSON array of { key, label, status: pass | review | fail, detail }. */
  checks: text('checks').notNull(),
  /** KTP reader (model ID, "test-stub") and face engine used; null for seed / manual review. */
  reader: text('reader'),
  faceEngine: text('face_engine'),
  /** Manual review: the admin's reason. Scenario name for specimen checks. */
  note: text('note'),
}, (t) => [
  index('identity_checks_recipient_ix').on(t.recipientId, t.at),
  index('identity_checks_at_ix').on(t.at),
  check('identity_checks_outcome_ck', inList('outcome', IDENTITY_OUTCOMES)),
  check('identity_checks_source_ck', inList('source', IDENTITY_SOURCES)),
]);

// ------------------------------------------------------------------ Payroll Advance (Phase 23)

export const ADVANCE_STATUSES = ['requested', 'declined', 'submitted', 'approved', 'paid', 'repaid', 'rejected', 'cancelled', 'failed'] as const;
export type AdvanceStatus = (typeof ADVANCE_STATUSES)[number];
/** Statuses that block a new request (one advance at a time; partial unique index). */
export const OPEN_ADVANCE_STATUSES = ['requested', 'submitted', 'approved', 'paid'] as const;

/**
 * A Payroll Advance: an employee's salary advance, repaid like a loan from payroll. The terms
 * (amount, fee, net payout, instalments) and the consent are fixed at the request (trigger).
 * Paid as an ordinary one-row run (payroll_runs.kind = advance) through the vault's approvals.
 */
export const payrollAdvances = sqliteTable('payroll_advances', {
  id: text('id').primaryKey(),
  recipientId: text('recipient_id').notNull().references(() => recipients.id),
  employeeUserId: text('employee_user_id').notNull().references(() => users.id),
  /** A: the advance the employee owes. */
  amount: units('amount').notNull(),
  /** Fee taken at payout (employer income, never repaid). */
  fee: units('fee').notNull(),
  /** A − fee: the one-row run committed on-chain. */
  net: units('net').notNull(),
  instalmentCount: integer('instalment_count').notNull(),
  /** Regular monthly instalment (A ÷ n rounded down); the last one absorbs the rounding. */
  instalment: units('instalment').notNull(),
  lastInstalment: units('last_instalment').notNull(),
  reason: text('reason'),
  /** The exact consent text the employee ticked, and when. */
  consentText: text('consent_text').notNull(),
  consentedAt: ms('consented_at').notNull(),
  /** JSON array of the expected months shown at the request ("2026-11", …). */
  expectedMonths: text('expected_months').notNull(),
  /** JSON: the policy and the eligibility checks at the request. */
  policySnapshot: text('policy_snapshot').notNull(),
  eligibilityAtRequest: text('eligibility_at_request').notNull(),
  /** JSON: the eligibility re-check when the maker submitted. */
  eligibilityAtSubmit: text('eligibility_at_submit'),
  status: text('status', { enum: ADVANCE_STATUSES }).notNull(),
  /** Decline / rejection reason or a note on a failed submission (no PII). */
  statusDetail: text('status_detail'),
  decidedByUserId: text('decided_by_user_id').references(() => users.id),
  decidedAt: ms('decided_at'),
  runId: text('run_id').references(() => payrollRuns.id),
  paidAt: ms('paid_at'),
  repaidAt: ms('repaid_at'),
  createdAt: ms('created_at').notNull(),
  updatedAt: ms('updated_at').notNull(),
}, (t) => [
  index('payroll_advances_recipient_ix').on(t.recipientId, t.createdAt),
  uniqueIndex('payroll_advances_run_uq').on(t.runId),
  uniqueIndex('payroll_advances_one_open_uq').on(t.recipientId).where(sql`status IN ('requested', 'submitted', 'approved', 'paid')`),
  check('payroll_advances_status_ck', inList('status', ADVANCE_STATUSES)),
  check('payroll_advances_count_ck', sql`instalment_count BETWEEN 1 AND 12`),
]);

/**
 * Payroll Advance instalments carried by a payroll version's rows: gross (the uploaded or
 * entered amount), instalment and net (committed on-chain). Frozen with the version.
 */
export const advanceDeductions = sqliteTable('advance_deductions', {
  versionId: text('version_id').notNull().references(() => runVersions.id),
  rowIndex: integer('row_index').notNull(),
  advanceId: text('advance_id').notNull().references(() => payrollAdvances.id),
  recipientId: text('recipient_id').notNull().references(() => recipients.id),
  /** Calendar month (UTC) of the payroll that carries the instalment, "2026-11". */
  month: text('month').notNull(),
  gross: units('gross').notNull(),
  instalment: units('instalment').notNull(),
  net: units('net').notNull(),
  createdAt: ms('created_at').notNull(),
}, (t) => [
  primaryKey({ columns: [t.versionId, t.rowIndex] }),
  index('advance_deductions_advance_ix').on(t.advanceId),
]);

export const LEDGER_KINDS = ['advance', 'instalment'] as const;

/**
 * Append-only Payroll Advance ledger per employee. advance: counts when the advance run's row is
 * paid on-chain (amount A). instalment: counts when the payroll row that carries it is paid.
 */
export const advanceLedger = sqliteTable('advance_ledger', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  advanceId: text('advance_id').notNull().references(() => payrollAdvances.id),
  recipientId: text('recipient_id').notNull().references(() => recipients.id),
  kind: text('kind', { enum: LEDGER_KINDS }).notNull(),
  amount: units('amount').notNull(),
  versionId: text('version_id').notNull().references(() => runVersions.id),
  rowIndex: integer('row_index').notNull(),
  txHash: text('tx_hash'),
  at: ms('at').notNull(),
}, (t) => [
  uniqueIndex('advance_ledger_row_uq').on(t.versionId, t.rowIndex, t.kind),
  index('advance_ledger_recipient_ix').on(t.recipientId, t.id),
  check('advance_ledger_kind_ck', inList('kind', LEDGER_KINDS)),
]);
