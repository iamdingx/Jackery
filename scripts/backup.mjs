import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function backupData(dataDir, destinationRoot) {
  const source = path.resolve(dataDir), sourceDb = path.join(source, 'huabao.sqlite');
  if (!existsSync(sourceDb)) throw new Error(`Database not found: ${sourceDb}`);
  const stamp = new Date().toISOString().replaceAll(':', '-').replace('.', '-');
  const folder = path.resolve(destinationRoot, `huabao-${stamp}-${process.pid}`);
  if (folder === source || folder.startsWith(source + path.sep)) throw new Error('Backup destination must be outside the live data directory');
  mkdirSync(path.dirname(folder), { recursive: true });
  mkdirSync(folder, { recursive: false });
  const db = new DatabaseSync(sourceDb, { readOnly: true });
  try { await backup(db, path.join(folder, 'huabao.sqlite')); } finally { db.close(); }
  if (existsSync(path.join(source, 'photos'))) cpSync(path.join(source, 'photos'), path.join(folder, 'photos'), { recursive: true, errorOnExist: true, force: false });
  writeFileSync(path.join(folder, 'backup-manifest.json'), JSON.stringify({ version: '1.0.0', createdAt: new Date().toISOString(), source, database: 'huabao.sqlite', photos: 'photos/', method: 'SQLite online backup plus preserved original photos' }, null, 2) + '\n');
  return folder;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const value = flag => { const i = process.argv.indexOf(flag); return i === -1 ? undefined : process.argv[i + 1]; };
  const data = value('--data-dir') ?? process.env.HB_DATA_DIR ?? path.join(root, process.argv.includes('--demo') ? 'data-demo' : 'data');
  const destination = value('--output') ?? path.join(root, 'backups');
  mkdirSync(path.resolve(destination), { recursive: true });
  backupData(data, destination).then(folder => console.log(`Backup complete: ${folder}`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
