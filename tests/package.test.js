import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { collectPackageFiles, buildDelivery } from '../scripts/package.mjs';
import { candidateFingerprint } from '../scripts/project.mjs';

function fixture() {
  const tmpRoot = path.resolve('tests/.tmp'); mkdirSync(tmpRoot, { recursive: true });
  const folder = mkdtempSync(path.join(tmpRoot, 'package-'));
  for (const name of ['src','public','tests','docs','data','data-demo','backups','artifacts/verification','.git','node_modules']) mkdirSync(path.join(folder, name), { recursive: true });
  const files = { 'server.js':'// sample server', 'package.json':'{"name":"packaging-fixture"}', 'src/domain.js':'export const demo = true;', 'public/index.html':'<p>Demo</p>', 'tests/sample.test.js':'// fixture', 'docs/start.md':'Start instructions', '.gitignore':'data/', '.env':'secret', 'data/huabao.sqlite':'secret database', 'data-demo/huabao.sqlite':'demo database', 'backups/secret.json':'backup', 'artifacts/run.log':'log', '.git/config':'git', 'node_modules/not-source.js':'dependency', 'first-run-accounts.json':'secret password' };
  for (const [name, value] of Object.entries(files)) writeFileSync(path.join(folder, name), value);
  return folder;
}

test('delivery excludes database, credentials, backups, node_modules, Git and temporary artifacts', () => {
  const folder = fixture();
  const names = collectPackageFiles(folder).map(x => x.relative);
  assert.ok(names.includes('server.js') && names.includes('public/index.html') && names.includes('docs/start.md'));
  assert.ok(names.includes('.gitignore'));
  for (const bad of ['data/','data-demo/','backups/','node_modules/','.git/','artifacts/']) assert.ok(!names.some(n => n.startsWith(bad)), bad);
  assert.ok(!names.includes('.env') && !names.includes('first-run-accounts.json'));
});

test('delivery refuses unverified and stale code candidates', () => {
  const folder = fixture(), output = path.join(folder, 'artifacts', 'delivery');
  assert.throws(() => buildDelivery({ projectRoot: folder, outputDir: output }), /verif/i);
  const proof = { passed: true, candidate: candidateFingerprint(folder), stages: [{ name:'fixture',tests:1,pass:1,fail:0 }] };
  writeFileSync(path.join(folder, 'artifacts/verification/summary.json'), JSON.stringify(proof));
  writeFileSync(path.join(folder, 'src/domain.js'), '// changed after verification');
  assert.throws(() => buildDelivery({ projectRoot: folder, outputDir: output }), /candidate|stale|changed/i);
});

test('delivery writes a complete ZIP and digest for the exact verified candidate', () => {
  const folder = fixture(), output = path.join(folder, 'artifacts', 'delivery');
  writeFileSync(path.join(folder, 'artifacts/verification/summary.json'), JSON.stringify({ passed: true, candidate: candidateFingerprint(folder), stages: [{name:'fixture',tests:1,pass:1,fail:0}] }));
  const result = buildDelivery({ projectRoot: folder, outputDir: output });
  assert.ok(existsSync(result.zipPath) && existsSync(result.manifestPath));
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.ok(result.files >= 6);
});
