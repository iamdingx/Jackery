import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { backupData } from '../scripts/backup.mjs';

test('operations backup uses SQLite online backup and preserves original photos', async () => {
  const base = path.resolve('tests/.tmp'); mkdirSync(base, { recursive: true });
  const tmp = mkdtempSync(path.join(base, 'backup-'));
  const source = path.join(tmp, 'source'), output = path.join(tmp, 'backups');
  mkdirSync(path.join(source, 'photos'), { recursive: true });
  const db = new DatabaseSync(path.join(source, 'huabao.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE evidence(id INTEGER PRIMARY KEY, value TEXT); INSERT INTO evidence(value) VALUES(\'persistent\');');
  writeFileSync(path.join(source, 'photos', 'original.jpg'), Buffer.from([1, 2, 3, 4]));
  try {
    const folder = await backupData(source, output);
    const saved = new DatabaseSync(path.join(folder, 'huabao.sqlite'), { readOnly: true });
    try { assert.equal(saved.prepare('SELECT value FROM evidence').get().value, 'persistent'); } finally { saved.close(); }
    assert.deepEqual(readFileSync(path.join(folder, 'photos', 'original.jpg')), Buffer.from([1, 2, 3, 4]));
    assert.ok(existsSync(path.join(folder, 'backup-manifest.json')));
    assert.ok(existsSync(path.join(source, 'huabao.sqlite')), 'Original database is not moved or deleted');
  } finally { db.close(); }
});

test('operations backup rejects a missing database rather than creating an empty one', async () => {
  await assert.rejects(() => backupData(path.resolve('tests/.tmp/no-such-db'), path.resolve('tests/.tmp/unused-backup')), /database/i);
});
