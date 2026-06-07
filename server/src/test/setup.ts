import { beforeAll, afterAll } from 'vitest';
import { unlinkSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const testDbPath = path.join(import.meta.dirname, '../../../data/test.db');

beforeAll(() => {
  // Ensure data directory exists
  const dir = path.dirname(testDbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  process.env.DATABASE_PATH = testDbPath;
});

afterAll(() => {
  // Clean up test database
  if (existsSync(testDbPath)) {
    unlinkSync(testDbPath);
  }
});
