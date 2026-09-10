import { SequelizeStorage, Umzug } from 'umzug';
import { createDatabase } from './index.js';

function getDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error('DATABASE_URL is required to run migrations');
  }
  return value;
}

const sequelize = createDatabase({
  url: getDatabaseUrl(),
  logging: process.env.DB_LOGGING === 'true',
});

const migrator = new Umzug({
  migrations: { glob: ['migrations/*.js', { cwd: new URL('.', import.meta.url).pathname }] },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize, tableName: 'sequelize_meta' }),
  logger: console,
});

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'up';

  await sequelize.authenticate();

  if (command === 'up') {
    await migrator.up();
  } else if (command === 'down') {
    await migrator.down();
  } else if (command === 'status') {
    const [executed, pending] = await Promise.all([migrator.executed(), migrator.pending()]);
    console.log(JSON.stringify({
      executed: executed.map((migration) => migration.name),
      pending: pending.map((migration) => migration.name),
    }, null, 2));
  } else {
    throw new Error(`Unknown migration command: ${command}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
