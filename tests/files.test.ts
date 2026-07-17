import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeJsonFile, writeTextFile } from '../src/utils/files.js';

let testDir: string | undefined;

function makeTestDir(): string {
  testDir = path.join(os.tmpdir(), `scraper-challenge-files-test-${randomUUID()}`);
  return testDir;
}

afterEach(async () => {
  if (testDir) {
    await fs.rm(testDir, { recursive: true, force: true });
    testDir = undefined;
  }
});

describe('writeTextFile', () => {
  it('creates nested parent directories that do not exist yet and writes the exact content', async () => {
    const dir = makeTestDir();
    const filePath = path.join(dir, 'nested', 'deeper', 'file.txt');

    await writeTextFile(filePath, 'hello world');

    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('hello world');
  });
});

describe('writeJsonFile', () => {
  it('writes valid, correctly indented JSON that parses back to the original object', async () => {
    const dir = makeTestDir();
    const filePath = path.join(dir, 'nested', 'data.json');
    const data = { foo: 'bar', count: 3, nested: { ok: true } };

    await writeJsonFile(filePath, data);

    const raw = await fs.readFile(filePath, 'utf-8');
    expect(raw).toBe(JSON.stringify(data, null, 2));
    expect(JSON.parse(raw)).toEqual(data);
  });
});
