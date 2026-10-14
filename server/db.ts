import { createClient, type Client } from '@libsql/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

let _db: Client | null = null;

export function getDb(): Client {
  if (!_db) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url) {
      throw new Error('TURSO_DATABASE_URL não configurada (ver .env ou env vars do Netlify)');
    }
    _db = createClient({ url, authToken });
  }
  return _db;
}

export function toBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

export function fromBool(value: unknown): 0 | 1 {
  return toBool(value) ? 1 : 0;
}

export function plainRow<T = Record<string, unknown>>(row: unknown): T {
  const out: Record<string, unknown> = {};
  const r = row as Record<string, unknown>;
  for (const key of Object.keys(r)) out[key] = r[key];
  return out as T;
}
