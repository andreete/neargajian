DROP INDEX `workflow_configs_revision_uq`;--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_configs_revision_uq` ON `workflow_configs` (`revision`) WHERE chain_status <> 'failed';