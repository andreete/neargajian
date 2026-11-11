CREATE TABLE `face_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`nonce_hash` text NOT NULL,
	`turn_order` text NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `recipients`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "face_challenges_order_ck" CHECK(turn_order IN ('left_right', 'right_left'))
);
--> statement-breakpoint
CREATE INDEX `face_challenges_user_ix` ON `face_challenges` (`user_id`,`issued_at`);--> statement-breakpoint
CREATE TABLE `face_check_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`challenge_id` text,
	`at` integer NOT NULL,
	`outcome` text NOT NULL,
	`similarity` real,
	`turn_order` text,
	`liveness_passed` integer NOT NULL,
	`frames` integer NOT NULL,
	`engine` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `recipients`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "face_check_attempts_outcome_ck" CHECK(outcome IN ('passed', 'mismatch', 'no_face', 'multiple_faces', 'turn', 'changed_face', 'no_template', 'challenge_invalid', 'bad_frames'))
);
--> statement-breakpoint
CREATE INDEX `face_check_attempts_user_ix` ON `face_check_attempts` (`user_id`,`at`);--> statement-breakpoint
CREATE TABLE `face_template_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipient_id` text NOT NULL,
	`action` text NOT NULL,
	`reason` text NOT NULL,
	`actor_user_id` text,
	`identity_check_id` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`recipient_id`) REFERENCES `recipients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "face_template_events_action_ck" CHECK(action IN ('created', 'replaced', 'activated', 'deleted'))
);
--> statement-breakpoint
CREATE INDEX `face_template_events_recipient_ix` ON `face_template_events` (`recipient_id`,`at`);--> statement-breakpoint
CREATE TABLE `face_templates` (
	`recipient_id` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`key_id` text NOT NULL,
	`status` text NOT NULL,
	`source` text NOT NULL,
	`identity_check_id` text,
	`engine` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`recipient_id`) REFERENCES `recipients`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "face_templates_status_ck" CHECK(status IN ('active', 'pending')),
	CONSTRAINT "face_templates_source_ck" CHECK(source IN ('identity_check', 'seed'))
);
--> statement-breakpoint
ALTER TABLE `payroll_advances` ADD `face_check` text;--> statement-breakpoint
ALTER TABLE `payroll_advances` ADD `face_attempt_id` text REFERENCES face_check_attempts(id);--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_advances_face_attempt_uq` ON `payroll_advances` (`face_attempt_id`);--> statement-breakpoint
-- Hand-written (Phase 24): the template log and the face check attempts are append-only; the face
-- check of a request is fixed with its terms (the trigger is recreated with the two new columns).
CREATE TRIGGER face_template_events_no_update
BEFORE UPDATE ON face_template_events
BEGIN
  SELECT RAISE(ABORT, 'face_template_events: the template log is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER face_template_events_no_delete
BEFORE DELETE ON face_template_events
BEGIN
  SELECT RAISE(ABORT, 'face_template_events: the template log is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER face_check_attempts_no_update
BEFORE UPDATE ON face_check_attempts
BEGIN
  SELECT RAISE(ABORT, 'face_check_attempts: attempts are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER face_check_attempts_no_delete
BEFORE DELETE ON face_check_attempts
BEGIN
  SELECT RAISE(ABORT, 'face_check_attempts: attempts are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER face_challenges_use_once
BEFORE UPDATE ON face_challenges
WHEN OLD.used_at IS NOT NULL OR NEW.id IS NOT OLD.id OR NEW.user_id IS NOT OLD.user_id OR NEW.recipient_id IS NOT OLD.recipient_id OR NEW.nonce_hash IS NOT OLD.nonce_hash OR NEW.turn_order IS NOT OLD.turn_order OR NEW.issued_at IS NOT OLD.issued_at OR NEW.expires_at IS NOT OLD.expires_at
BEGIN
  SELECT RAISE(ABORT, 'face_challenges: a challenge is used once and never changed');
END;
--> statement-breakpoint
DROP TRIGGER payroll_advances_terms_fixed;--> statement-breakpoint
CREATE TRIGGER payroll_advances_terms_fixed
BEFORE UPDATE OF recipient_id, employee_user_id, amount, fee, net, instalment_count, instalment, last_instalment, reason, consent_text, consented_at, expected_months, policy_snapshot, eligibility_at_request, created_at, face_check, face_attempt_id ON payroll_advances
BEGIN
  SELECT RAISE(ABORT, 'payroll_advances: the terms and the consent of a request are fixed');
END;
