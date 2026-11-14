/**
 * Loads .env from the repo root before any module reads process.env.
 * Imported first in server/index.ts — ESM evaluates imports in order.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(path.resolve(fileURLToPath(new URL('..', import.meta.url)), '.env'));
} catch (err) {
  // No .env file: fall back to real environment variables (CI, containers).
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
}
