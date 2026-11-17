import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const state = sqliteTable('edge_state', { id: integer('id').primaryKey(), version: integer('version').notNull(), payload: text('payload').notNull(), lease: text('lease'), leaseUntil: integer('lease_until').notNull().default(0) });
export const archive = sqliteTable('edge_archive', { id: text('id').primaryKey(), created: integer('created').notNull(), kind: text('kind').notNull(), portfolio: text('portfolio').notNull(), payload: text('payload').notNull() });
