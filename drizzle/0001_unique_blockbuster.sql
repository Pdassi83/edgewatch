CREATE TABLE `edge_archive` (
	`id` text PRIMARY KEY NOT NULL,
	`created` integer NOT NULL,
	`kind` text NOT NULL,
	`portfolio` text NOT NULL,
	`payload` text NOT NULL
);
