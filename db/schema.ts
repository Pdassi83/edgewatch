import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const state = sqliteTable('edge_state', { id: integer('id').primaryKey(), version: integer('version').notNull(), payload: text('payload').notNull(), lease: text('lease'), leaseUntil: integer('lease_until').notNull().default(0) });
