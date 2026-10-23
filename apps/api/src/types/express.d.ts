import type { HydratedDocument } from 'mongoose';
import type { UserDoc } from '../models/user.js';

declare global {
  namespace Express {
    interface Request {
      user?: HydratedDocument<UserDoc>;
      sessionToken?: string;
      rawBody?: Buffer;
    }
  }
}

export {};
