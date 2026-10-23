import { Migration } from '../models/index.js';
import { connect, run } from './common.js';
import { migrations } from '../db/migrations/index.js';

/** Applies pending migrations in order; each is recorded once in the `migrations` collection. */
void run(async () => {
  await connect();
  for (const m of migrations) {
    if (await Migration.exists({ name: m.name })) continue;
    console.log(`Applying ${m.name}…`);
    await m.up();
    await Migration.create({ name: m.name, appliedAt: new Date() });
  }
  console.log('Migrations complete.');
});
