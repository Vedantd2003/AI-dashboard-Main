import { User } from '../models/index.js';
import { audit } from '../services/audit.js';
import { issueAuthToken } from '../services/auth.js';
import { connect, run } from './common.js';

/**
 * Admin-assisted account recovery when email is not configured.
 * Usage: npm run admin:reset-link -w @alphapulse/api -- user@example.com
 * Prints a single-use, 1-hour reset URL. Deliver it out-of-band only after verifying the requester's identity.
 */
void run(async () => {
  const config = await connect();
  const email = (process.argv[2] ?? '').toLowerCase().trim();
  if (!email) throw new Error('Usage: admin:reset-link -- <email>');
  const user = await User.findOne({ email });
  if (!user) throw new Error('No such user');
  const token = await issueAuthToken(user._id, 'reset_password', 3600_000);
  await audit('admin.reset_link_issued', { target: String(user._id) });
  console.log(`${config.APP_BASE_URL}/reset-password?token=${token}`);
});
