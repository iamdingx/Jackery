import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export function walk(folder, ignore = new Set()) {
  const result = [];
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (ignore.has(entry.name) || entry.isSymbolicLink()) continue;
    const target = path.join(folder, entry.name);
    if (entry.isDirectory()) result.push(...walk(target, ignore));
    else if (entry.isFile()) result.push(target);
  }
  return result.sort();
}
export function candidateFingerprint(projectRoot = root) {
  const files = ['server.js', 'package.json', ...['Start.cmd','Start-Demo.cmd','start.sh'].filter(name=>existsSync(path.join(projectRoot,name))), ...['src', 'public', 'tests', 'scripts','catalogs'].filter(dir=>existsSync(path.join(projectRoot,dir))).flatMap(dir => walk(path.join(projectRoot, dir), new Set(['.tmp'])).map(file => path.relative(projectRoot, file)))].sort();
  const hash = createHash('sha256');
  for (const name of files) hash.update(name.replaceAll('\\', '/') + '\0').update(readFileSync(path.join(projectRoot, name))).update('\0');
  return hash.digest('hex');
}
