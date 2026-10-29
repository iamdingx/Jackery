import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { candidateFingerprint, root } from './project.mjs';

const output = path.join(root, 'artifacts', 'verification');
mkdirSync(output, { recursive: true });
const summary = { startedAt: new Date().toISOString(), node: process.version, candidate: candidateFingerprint(), passed: false, stages: [] };
function run(name, files) {
  return new Promise(resolve => {
    const log = [];
    const child = spawn(process.execPath, ['--test', '--test-reporter=spec', ...files], { cwd: root, env: process.env, windowsHide: true });
    const timer = setTimeout(() => { child.kill(); }, 8 * 60 * 1000);
    child.stdout.on('data', d => log.push(d)); child.stderr.on('data', d => log.push(d));
    child.on('error', e => log.push(Buffer.from(e.stack + '\n')));
    child.on('close', code => {
      clearTimeout(timer);
      const text = Buffer.concat(log).toString('utf8');
      const logName = name + '.log'; writeFileSync(path.join(output, logName), text);
      const count = key => Number(text.match(new RegExp('(?:ℹ|#)\\s*' + key + '\\s+(\\d+)'))?.[1] ?? 0);
      const stage = { name, code, tests: count('tests'), pass: count('pass'), fail: count('fail'), cancelled: count('cancelled'), skipped: count('skipped'), log: 'artifacts/verification/' + logName };
      summary.stages.push(stage);
      console.log(`\n${name}: ${stage.pass}/${stage.tests}, exit ${code}`);
      console.log(text.trim().split(/\r?\n/).slice(-15).join('\n'));
      resolve(code === 0 && stage.tests > 0 && !stage.fail && !stage.cancelled && !stage.skipped);
    });
  });
}
const core = readdirSync(path.join(root, 'tests')).filter(n => n.endsWith('.test.js')).sort().map(n => 'tests/' + n);
console.log('Running V1 full regression on candidate ' + summary.candidate.slice(0, 16));
let ok = await run('core', core);
if (ok) ok = await run('browser-e2e', ['tests/e2e.test.mjs']);
summary.finishedAt = new Date().toISOString();
summary.passed = ok && summary.candidate === candidateFingerprint();
writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(`\nVerification ${summary.passed ? 'PASS' : 'FAIL'}; evidence: artifacts/verification/summary.json`);
process.exitCode = summary.passed ? 0 : 1;
