/**
 * SQLite connection (better-sqlite3 + Drizzle). One file on a persistent disk, WAL mode so
 * the web app and the release worker can share it, foreign keys on, migrations applied on
 * open (idempotent). Synchronous driver: wrap each state change in `db.transaction(...)`.
 */
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import * as schema from './schema.ts';

export type Db = BetterSQLite3Database<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Anything that can run queries: the database or an open transaction. */
export type Queryable = Db | Tx;
export interface DatabaseHandle { db: Db; sqlite: Database.Database; file: string }

export function databaseFileFromUrl(url: string | undefined): string {
  const value = url ?? 'file:./data/sentfund.sqlite';
  if (value === ':memory:') return value;
  if (!value.startsWith('file:')) throw new Error('DATABASE_URL must be file:<path> (SQLite)');
  const path = value.slice('file:'.length);
  // Runtime path from the environment: not a build-time dependency (keeps tracing scoped).
  return isAbsolute(path) ? path : resolve(/* turbopackIgnore: true */ process.cwd(), path);
}

export function openDatabase(file: string, options: { migrationsFolder?: string } = {}): DatabaseHandle {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: options.migrationsFolder ?? resolve(process.cwd(), 'db/migrations') });
  return { db, sqlite, file };
}

const globalForDb = globalThis as unknown as { sentfundDb?: DatabaseHandle };

/** Process-wide connection from DATABASE_URL (reused across Next.js hot reloads). */
export function getDatabase(): DatabaseHandle {
  globalForDb.sentfundDb ??= openDatabase(databaseFileFromUrl(process.env.DATABASE_URL));
  return globalForDb.sentfundDb;
}

export function getDb(): Db {
  return getDatabase().db;
}

export function closeDatabase(): void {
  globalForDb.sentfundDb?.sqlite.close();
  delete globalForDb.sentfundDb;
}
