import mongoose from 'mongoose';
import { loadConfig } from '../config.js';

export async function connect() {
  const config = loadConfig();
  if (!config.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(config.MONGODB_URI);
  return config;
}

export async function run(fn: () => Promise<void>) {
  try {
    await fn();
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error((e as Error).message);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
  }
}
