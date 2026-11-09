-- Integrity rules that the schema DSL cannot express. Hand-written; keep in sync with
-- src/server/db/schema.ts. Each statement is separated by a Drizzle statement breakpoint.

-- Submitted versions are immutable: only status, status_updated_at, submit_tx_hash and
-- superseded_by_version_id may change, and versions are never deleted.
CREATE TRIGGER run_versions_immutable
BEFORE UPDATE OF run_id, version_no, chain_run_id, posting_mode, workflow_revision, workflow_snapshot,
  row_count, total, payout_root, review_digest, review_salt, source_filename, source_sha256,
  created_by_user_id, created_at ON run_versions
BEGIN
  SELECT RAISE(ABORT, 'run_versions: submitted version data is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER run_versions_no_delete
BEFORE DELETE ON run_versions
BEGIN
  SELECT RAISE(ABORT, 'run_versions: versions are never deleted');
END;
--> statement-breakpoint
-- Terminal statuses never change again.
CREATE TRIGGER run_versions_terminal
BEFORE UPDATE OF status ON run_versions
WHEN OLD.status IN ('rejected', 'cancelled', 'paid', 'partially_paid') AND NEW.status <> OLD.status
BEGIN
  SELECT RAISE(ABORT, 'run_versions: terminal status cannot change');
END;
--> statement-breakpoint
-- Rows of a submitted version are immutable and append-only while the version is being written.
CREATE TRIGGER version_rows_no_update
BEFORE UPDATE ON version_rows
BEGIN
  SELECT RAISE(ABORT, 'version_rows: rows of a submitted version are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER version_rows_no_delete
BEFORE DELETE ON version_rows
BEGIN
  SELECT RAISE(ABORT, 'version_rows: rows of a submitted version are never deleted');
END;
--> statement-breakpoint
-- Rows can only be added while the version is still 'submitting' (before the chain call).
CREATE TRIGGER version_rows_insert_only_while_submitting
BEFORE INSERT ON version_rows
WHEN (SELECT status FROM run_versions WHERE id = NEW.version_id) IS NOT 'submitting'
BEGIN
  SELECT RAISE(ABORT, 'version_rows: version is no longer accepting rows');
END;
--> statement-breakpoint
-- At most one live approval decision per approver per version.
CREATE UNIQUE INDEX approval_events_live_uq ON approval_events (version_id, approver_user_id)
WHERE status <> 'failed';
--> statement-breakpoint
-- At most one live chain action per version/kind/row: a new attempt only after a failure.
CREATE UNIQUE INDEX payout_actions_live_uq ON payout_actions (version_id, kind, coalesce(row_index, -1))
WHERE status <> 'failed';
--> statement-breakpoint
-- Attempt numbers are unique per version/kind/row.
CREATE UNIQUE INDEX payout_actions_attempt_uq ON payout_actions (version_id, kind, coalesce(row_index, -1), attempt);
--> statement-breakpoint
-- A succeeded chain action is final.
CREATE TRIGGER payout_actions_succeeded_final
BEFORE UPDATE OF status ON payout_actions
WHEN OLD.status = 'succeeded' AND NEW.status <> 'succeeded'
BEGIN
  SELECT RAISE(ABORT, 'payout_actions: a succeeded action is final');
END;
--> statement-breakpoint
-- Only one active workflow revision at a time.
CREATE UNIQUE INDEX workflow_configs_one_active_uq ON workflow_configs (chain_status) WHERE chain_status = 'active';
