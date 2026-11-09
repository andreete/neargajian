#!/usr/bin/env node
// Database commands (Node 26 runs this TypeScript directly).
//   node --env-file-if-exists=.env scripts/db.ts migrate   apply migrations to DATABASE_URL
//   node --env-file-if-exists=.env scripts/db.ts seed      migrate + deterministic demo seed (DEMO_MODE=true)
//   node --env-file-if-exists=.env scripts/db.ts status    row counts per table
import { closeDatabase, getDatabase } from '../src/server/db/client.ts';
import { seedDemo } from '../src/server/db/seed.ts';

const command = process.argv[2] ?? 'status';
const { db, sqlite, file } = getDatabase(); // opening applies pending migrations
console.log(`database: ${file}`);
if (command === 'seed') {
  const created = await seedDemo(db);
  console.log(created.length ? `seeded: ${created.join(', ')}` : 'seed: nothing to do (already seeded)');
} else if (command !== 'migrate' && command !== 'status') {
  console.error(`unknown command: ${command}`);
  process.exitCode = 2;
}
if (command === 'migrate') console.log('migrations applied');
const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name").all() as { name: string }[];
for (const { name } of tables) {
  const { n } = sqlite.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number };
  console.log(`  ${name.padEnd(18)} ${n}`);
}
closeDatabase();
