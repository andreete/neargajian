import { defineConfig } from 'drizzle-kit';

// Migrations are generated from src/server/db/schema.ts into db/migrations (SQL files,
// committed). Integrity triggers live in the hand-written 0001_integrity.sql migration.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/db/schema.ts',
  out: './db/migrations',
  dbCredentials: { url: './.tmp/drizzle-kit.sqlite' },
  strict: true,
  verbose: true,
});
