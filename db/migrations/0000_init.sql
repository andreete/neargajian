CREATE TABLE `approval_events` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`approver_user_id` text NOT NULL,
	`step` integer NOT NULL,
	`decision` text NOT NULL,
	`reason` text,
	`status` text NOT NULL,
	`chain_tx_hash` text,
	`created_at` integer NOT NULL,
	`confirmed_at` integer,
	FOREIGN KEY (`version_id`) REFERENCES `run_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approver_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "approval_events_step_ck" CHECK(step IN (1, 2)),
	CONSTRAINT "approval_events_decision_ck" CHECK(decision IN ('approve', 'reject')),
	CONSTRAINT "approval_events_status_ck" CHECK(status IN ('pending', 'confirmed', 'failed')),
	CONSTRAINT "approval_events_reason_ck" CHECK(decision = 'approve' OR (reason IS NOT NULL AND length(trim(reason)) > 0))
);
--> statement-breakpoint
CREATE INDEX `approval_events_version_ix` ON `approval_events` (`version_id`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`detail` text,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_events_at_ix` ON `audit_events` (`at`);--> statement-breakpoint
CREATE TABLE `draft_rows` (
	`run_id` text NOT NULL,
	`position` integer NOT NULL,
	`near_account_id` text NOT NULL,
	`receiver_name` text NOT NULL,
	`currency` text NOT NULL,
	`amount` text NOT NULL,
	`mobile_phone` text NOT NULL,
	`email` text NOT NULL,
	`source_line` integer,
	PRIMARY KEY(`run_id`, `position`),
	FOREIGN KEY (`run_id`) REFERENCES `payroll_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email_hash` text NOT NULL,
	`client_hash` text NOT NULL,
	`succeeded` integer NOT NULL,
	`attempted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_attempts_email_ix` ON `login_attempts` (`email_hash`,`attempted_at`);--> statement-breakpoint
CREATE INDEX `login_attempts_client_ix` ON `login_attempts` (`client_hash`,`attempted_at`);--> statement-breakpoint
CREATE TABLE `payout_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`kind` text NOT NULL,
	`row_index` integer,
	`attempt` integer NOT NULL,
	`status` text NOT NULL,
	`worker_id` text NOT NULL,
	`lease_expires_at` integer NOT NULL,
	`tx_hash` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `run_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payout_actions_kind_ck" CHECK(kind IN ('release', 'pay_row')),
	CONSTRAINT "payout_actions_status_ck" CHECK(status IN ('claimed', 'submitted', 'succeeded', 'failed', 'unknown')),
	CONSTRAINT "payout_actions_row_ck" CHECK((kind = 'release' AND row_index IS NULL) OR (kind = 'pay_row' AND row_index >= 0)),
	CONSTRAINT "payout_actions_attempt_ck" CHECK(attempt >= 1)
);
--> statement-breakpoint
CREATE INDEX `payout_actions_version_ix` ON `payout_actions` (`version_id`);--> statement-breakpoint
CREATE TABLE `payroll_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`maker_user_id` text NOT NULL,
	`title` text NOT NULL,
	`posting_mode` text NOT NULL,
	`source` text NOT NULL,
	`draft_revision` integer DEFAULT 0 NOT NULL,
	`draft_filename` text,
	`draft_file_sha256` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`maker_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payroll_runs_posting_ck" CHECK(posting_mode IN ('consolidated', 'detailed')),
	CONSTRAINT "payroll_runs_source_ck" CHECK(source IN ('manual', 'upload'))
);
--> statement-breakpoint
CREATE INDEX `payroll_runs_maker_ix` ON `payroll_runs` (`maker_user_id`);--> statement-breakpoint
CREATE TABLE `report_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`version_id` text NOT NULL,
	`posting_mode` text NOT NULL,
	`reference` text NOT NULL,
	`row_index` integer,
	`amount` text NOT NULL,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `run_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "report_entries_posting_ck" CHECK(posting_mode IN ('consolidated', 'detailed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_entries_reference_uq` ON `report_entries` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `report_entries_version_row_uq` ON `report_entries` (`version_id`,`row_index`);--> statement-breakpoint
CREATE TABLE `run_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`version_no` integer NOT NULL,
	`chain_run_id` text NOT NULL,
	`posting_mode` text NOT NULL,
	`workflow_revision` integer NOT NULL,
	`workflow_snapshot` text NOT NULL,
	`row_count` integer NOT NULL,
	`total` text NOT NULL,
	`payout_root` text NOT NULL,
	`review_digest` text NOT NULL,
	`review_salt` text NOT NULL,
	`source_filename` text,
	`source_sha256` text,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text NOT NULL,
	`status_updated_at` integer NOT NULL,
	`submit_tx_hash` text,
	`superseded_by_version_id` text,
	FOREIGN KEY (`run_id`) REFERENCES `payroll_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "run_versions_status_ck" CHECK(status IN ('submitting', 'submit_failed', 'pending_approval', 'approved', 'rejected', 'cancelled', 'releasing', 'paid', 'partially_paid')),
	CONSTRAINT "run_versions_rows_ck" CHECK(row_count BETWEEN 1 AND 1000),
	CONSTRAINT "run_versions_root_ck" CHECK(length(payout_root) = 64 AND length(review_digest) = 64 AND length(review_salt) = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `run_versions_run_no_uq` ON `run_versions` (`run_id`,`version_no`);--> statement-breakpoint
CREATE UNIQUE INDEX `run_versions_chain_run_uq` ON `run_versions` (`chain_run_id`);--> statement-breakpoint
CREATE INDEX `run_versions_status_ix` ON `run_versions` (`status`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`csrf_token` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_ix` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_ix` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`chain_account_id` text,
	`created_at` integer NOT NULL,
	`disabled_at` integer,
	CONSTRAINT "users_role_ck" CHECK(role IN ('maker', 'approver', 'admin')),
	CONSTRAINT "users_email_lower_ck" CHECK(email = lower(email))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_chain_account_uq` ON `users` (`chain_account_id`);--> statement-breakpoint
CREATE TABLE `version_rows` (
	`version_id` text NOT NULL,
	`row_index` integer NOT NULL,
	`near_account_id` text NOT NULL,
	`receiver_name` text NOT NULL,
	`currency` text NOT NULL,
	`amount` text NOT NULL,
	`mobile_phone` text NOT NULL,
	`email` text NOT NULL,
	`source_line` integer,
	PRIMARY KEY(`version_id`, `row_index`),
	FOREIGN KEY (`version_id`) REFERENCES `run_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `version_rows_account_ix` ON `version_rows` (`near_account_id`);--> statement-breakpoint
CREATE TABLE `workflow_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`kind` text NOT NULL,
	`approver1_user_id` text NOT NULL,
	`approver2_user_id` text,
	`release_mode` text NOT NULL,
	`max_row_amount` text NOT NULL,
	`max_run_total` text NOT NULL,
	`chain_status` text NOT NULL,
	`chain_tx_hash` text,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`activated_at` integer,
	FOREIGN KEY (`approver1_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approver2_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "workflow_configs_kind_ck" CHECK(kind IN ('one', 'two_sequential', 'two_parallel')),
	CONSTRAINT "workflow_configs_release_ck" CHECK(release_mode IN ('automatic', 'maker')),
	CONSTRAINT "workflow_configs_status_ck" CHECK(chain_status IN ('pending', 'active', 'failed', 'superseded')),
	CONSTRAINT "workflow_configs_approvers_ck" CHECK((kind = 'one' AND approver2_user_id IS NULL) OR (kind <> 'one' AND approver2_user_id IS NOT NULL AND approver2_user_id <> approver1_user_id))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_configs_revision_uq` ON `workflow_configs` (`revision`);