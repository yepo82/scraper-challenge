import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadDocuments, saveDocuments } from '../src/storage/document-store.js';
import type { DocumentRecord } from '../src/types.js';

let testDir: string | undefined;

function makeTestDir(): string {
  testDir = path.join(os.tmpdir(), `scraper-challenge-document-store-test-${randomUUID()}`);
  return testDir;
}

afterEach(async () => {
  if (testDir) {
    await fs.rm(testDir, { recursive: true, force: true });
    testDir = undefined;
  }
});

function makeDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: 'doc-1',
    pageNumber: 1,
    rowNumber: 1,
    title: 'Apelación — EXP-001',
    expediente: 'EXP-001',
    sala: 'SALA CIVIL',
    materia: 'Civil',
    fecha: '17/07/2026',
    tipoResolucion: 'Sentencia de Vista',
    sumilla: 'Resumen del caso',
    rawFields: { recurso: 'Apelación', Especialidad: 'Civil' },
    pdfUrl: '/jurisprudenciaweb/ServletDescarga?uuid=abc',
    pdfFilename: 'EXP-001.pdf',
    pdfStatus: 'pending',
    scrapedAt: '2026-07-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('loadDocuments', () => {
  it('returns [] without throwing when documents.json does not exist yet', async () => {
    const outputDir = makeTestDir();

    await expect(loadDocuments(outputDir)).resolves.toEqual([]);
  });
});

describe('saveDocuments', () => {
  it('creates documents.json and documents.csv with round-trippable content', async () => {
    const outputDir = makeTestDir();
    const documents = [makeDocument(), makeDocument({ id: 'doc-2', expediente: 'EXP-002' })];

    const { jsonPath, csvPath } = await saveDocuments(outputDir, documents);

    expect(jsonPath).toBe(path.join(outputDir, 'documents.json'));
    expect(csvPath).toBe(path.join(outputDir, 'documents.csv'));

    const jsonRaw = await fs.readFile(jsonPath, 'utf-8');
    expect(JSON.parse(jsonRaw)).toEqual(documents);

    const csvRaw = await fs.readFile(csvPath, 'utf-8');
    const csvLines = csvRaw.trim().split('\n');
    expect(csvLines).toHaveLength(3); // header + 2 rows
    expect(csvRaw).toContain('EXP-001');
    expect(csvRaw).toContain('EXP-002');
  });

  it('avoids duplicates by id: a second save with the same id overwrites with new field values', async () => {
    const outputDir = makeTestDir();
    await saveDocuments(outputDir, [makeDocument({ id: 'shared-id', pdfStatus: 'pending' })]);

    await saveDocuments(outputDir, [makeDocument({ id: 'shared-id', pdfStatus: 'downloaded' })]);

    const loaded = await loadDocuments(outputDir);
    const matching = loaded.filter((doc) => doc.id === 'shared-id');

    expect(matching).toHaveLength(1);
    expect(matching[0]?.pdfStatus).toBe('downloaded');
  });

  it('accumulates documents with disjoint ids across separate calls', async () => {
    const outputDir = makeTestDir();
    await saveDocuments(outputDir, [makeDocument({ id: 'id-a' })]);
    await saveDocuments(outputDir, [makeDocument({ id: 'id-b' })]);

    const loaded = await loadDocuments(outputDir);
    const ids = loaded.map((doc) => doc.id).sort();

    expect(ids).toEqual(['id-a', 'id-b']);
  });
});
