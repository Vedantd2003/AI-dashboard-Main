import { ResearchReport, User } from '../../models/index.js';
import { randomToken } from '../../lib/crypto.js';

/**
 * Data migrations. Add new entries at the END with a NNN- prefix; never edit an applied one.
 * Every document carries `schemaVersion` so readers can branch on shape during a rollout.
 */
export const migrations: { name: string; up: () => Promise<void> }[] = [
  {
    name: '001-backfill-unsubscribe-tokens',
    up: async () => {
      const users = await User.find({ unsubscribeToken: { $exists: false } }).select('_id');
      for (const u of users) await User.updateOne({ _id: u._id }, { unsubscribeToken: randomToken(18) });
    },
  },
  {
    name: '002-unset-null-share-tokens',
    up: async () => {
      await ResearchReport.collection.updateMany({ shareToken: null }, { $unset: { shareToken: '' } });
    },
  },
];
