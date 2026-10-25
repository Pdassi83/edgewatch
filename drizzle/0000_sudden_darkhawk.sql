CREATE TABLE `edge_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`payload` text NOT NULL,
	`lease` text,
	`lease_until` integer DEFAULT 0 NOT NULL
);
