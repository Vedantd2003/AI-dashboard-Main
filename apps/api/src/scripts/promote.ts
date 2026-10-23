import { User } from '../models/index.js';
import { audit } from '../services/audit.js';
import { connect, run } from './common.js';

/** Usage: npm run admin:promote -w @alphapulse/api -- user@example.com */
void run(async () => {
  await connect();
  const email = (process.argv[2] ?? '').toLowerCase().trim();
  const r = await User.updateOne({ email }, { role: 'admin' });
  if (!r.matchedCount) throw new Error('No such user');
  await audit('admin.promoted_via_cli', { target: email });
  console.log(`${email} is now an admin.`);
});
