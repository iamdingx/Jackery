import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { makeZip } from '../src/zip.js';
import { candidateFingerprint, root } from './project.mjs';

const ignored = new Set(['.git','.superpowers','.codex','node_modules','runtime','data','data-demo','backups','artifacts','.tmp','release']);
export function collectPackageFiles(projectRoot = root) {
  const result = [];
  function scan(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (ignored.has(entry.name) || entry.isSymbolicLink() || entry.name === '.env' || entry.name.startsWith('.env.') || /first-run-(accounts|credentials)/i.test(entry.name) || /\.(sqlite(?:-(?:wal|shm))?|log)$/i.test(entry.name)) continue;
      const absolute = path.join(folder, entry.name);
      if (entry.isDirectory()) scan(absolute);
      else if (entry.isFile()) result.push({ absolute, relative: path.relative(projectRoot, absolute).replaceAll('\\', '/') });
    }
  }
  scan(path.resolve(projectRoot));
  return result.sort((a,b) => a.relative.localeCompare(b.relative));
}

export function buildDelivery({ projectRoot = root, outputDir = path.join(root, 'release') } = {}) {
  let proof;
  try { proof = JSON.parse(readFileSync(path.join(projectRoot, 'artifacts', 'verification', 'summary.json'), 'utf8')); } catch { throw new Error('Run complete verification before packaging'); }
  if (!proof.passed || !Array.isArray(proof.stages) || !proof.stages.length || proof.stages.some(s => s.fail || s.pass !== s.tests)) throw new Error('Verification has not passed completely');
  const candidate = candidateFingerprint(projectRoot);
  if (proof.candidate !== candidate) throw new Error('Verified candidate is stale: source changed after verification');
  const files = collectPackageFiles(projectRoot);
  const bytes = makeZip(files.map(f => ({ name: 'Huabao-Service-V1/' + f.relative, data: readFileSync(f.absolute) })));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  mkdirSync(outputDir, { recursive: true });
  const zipPath = path.join(outputDir, 'Huabao_Service_V1.zip'), manifestPath = path.join(outputDir, 'Huabao_Service_V1.sha256.json');
  writeFileSync(zipPath, bytes);
  writeFileSync(manifestPath, JSON.stringify({ package: path.basename(zipPath), version: '1.0.0', sha256, bytes: bytes.length, candidate, createdAt: new Date().toISOString(), files: files.map(f => f.relative), verification: proof }, null, 2) + '\n');
  return { zipPath, manifestPath, sha256, bytes: bytes.length, files: files.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--output-dir');
  try { console.log(JSON.stringify(buildDelivery({ outputDir: i === -1 ? undefined : path.resolve(process.argv[i+1]) }), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
