import fs from 'node:fs/promises';
import path from 'node:path';

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await writeTextFile(filePath, JSON.stringify(data, null, 2));
}
