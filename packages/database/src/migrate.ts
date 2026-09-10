import { QueryTypes } from 'sequelize';
import { createDatabase } from './index.js';
import * as initialSchema from './migrations/001-initial-schema.js';

type Migration = {
  name: string;
  up: typeof initialSchema.up;
  down: typeof initialSchema.down;
};

const migrations: Migration[] = [
  { name: '001-initial-schema', up: initialSchema.up, down: initialSchema.down },
];

function getDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL is required to run migrations');
  return value;
}

const sequelize = createDatabase({
  url: getDatabaseUrl(),
  logging: process.env.DB_LOGGING === 'true',
});

async function ensureMetadataTable(): Promise<void> {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS sequelize_meta (
      name VARCHAR(255) PRIMARY KEY,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function executedNames(): Promise<string[]> {
  const rows = await sequelize.query<{ name: string }>(
    'SELECT name FROM sequelize_meta ORDER BY executed_at ASC, name ASC',
    { type: QueryTypes.SELECT },
  );
  return rows.map((row) => row.name);
}

async function migrateUp(): Promise<void> {
  const executed = new Set(await executedNames());
  for (const migration of migrations) {
    if (executed.has(migration.name)) continue;
    console.log(`Applying ${migration.name}`);
    await migration.up({ context: sequelize.getQueryInterface() });
    await sequelize.query('INSERT INTO sequelize_meta(name) VALUES (:name)', { replacements: { name: migration.name } });
  }
}

async function migrateDown(): Promise<void> {
  const executed = await executedNames();
  const last = [...migrations].reverse().find((migration) => executed.includes(migration.name));
  if (!last) {
    console.log('No executed migrations to roll back');
    return;
  }
  console.log(`Rolling back ${last.name}`);
  await last.down({ context: sequelize.getQueryInterface() });
  await sequelize.query('DELETE FROM sequelize_meta WHERE name = :name', { replacements: { name: last.name } });
}

async function printStatus(): Promise<void> {
  const executed = await executedNames();
  const pending = migrations.map((migration) => migration.name).filter((name) => !executed.includes(name));
  console.log(JSON.stringify({ executed, pending }, null, 2));
}

async function main(): Promise<void> {
  await sequelize.authenticate();
  await ensureMetadataTable();
  const command = process.argv[2] ?? 'up';
  if (command === 'up') await migrateUp();
  else if (command === 'down') await migrateDown();
  else if (command === 'status') await printStatus();
  else throw new Error(`Unknown migration command: ${command}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
