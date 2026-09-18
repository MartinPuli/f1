import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const races = sqliteTable(
  'races',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    name: text('name').notNull(),
    created: integer('created').notNull(),
    metadata: text('metadata').notNull(),
    recording: text('recording').notNull(),
  },
  (t) => [index('races_owner_created').on(t.owner, t.created)],
);
