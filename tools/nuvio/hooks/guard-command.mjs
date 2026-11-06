import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { evaluateToolCall } from '../lib/guard.mjs';

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

const projectDir = process.env.DEVIN_PROJECT_DIR ?? process.cwd();
const resolveBranch = () =>
  spawnSync('git', ['branch', '--show-current'], {
    cwd: projectDir,
    encoding: 'utf8',
    windowsHide: true
  }).stdout?.trim();

const verdict = evaluateToolCall(readStdin(), { baseBranch: 'main', resolveBranch });

if (verdict.blocked) {
  const reason = `[nuvio-guard:${verdict.rule}] ${verdict.reason}`;
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.stderr.write(`${reason}\n`);
  process.exit(2);
}
