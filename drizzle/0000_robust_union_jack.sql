CREATE TABLE `races` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`created` integer NOT NULL,
	`metadata` text NOT NULL,
	`recording` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `races_owner_created` ON `races` (`owner`,`created`);