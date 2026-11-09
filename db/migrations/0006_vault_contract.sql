DROP INDEX `workflow_configs_revision_uq`;--> statement-breakpoint
ALTER TABLE `workflow_configs` ADD `vault_contract_id` text DEFAULT 'vault.gajian-payroll.testnet' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_configs_revision_uq` ON `workflow_configs` (`vault_contract_id`,`revision`) WHERE chain_status <> 'failed';--> statement-breakpoint
ALTER TABLE `run_versions` ADD `vault_contract_id` text DEFAULT 'vault.gajian-payroll.testnet' NOT NULL;