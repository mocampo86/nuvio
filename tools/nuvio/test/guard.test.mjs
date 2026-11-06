import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluateCommand, evaluateToolCall } from '../lib/guard.mjs';

const hooksDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'hooks');

describe('evaluateCommand', () => {
  const blocked = [
    'gh pr merge 12 --squash',
    '"C:\\Program Files\\GitHub CLI\\gh.exe" pr merge 12',
    'gh api -X PUT repos/o/r/pulls/3/merge',
    'gh api -X DELETE repos/o/r/branches/main/protection',
    'git push --force origin feat/US-001-x',
    'git push -f',
    'git push origin +feat/US-001-x',
    'git push origin main',
    'git push origin HEAD:main',
    'git status && git reset --hard HEAD~1',
    'git clean -fd',
    'git checkout -- .',
    'git restore apps/api/src/a.ts',
    'git branch -D feat/US-001-x',
    'git stash drop'
  ];
  for (const command of blocked) {
    it(`blocks: ${command}`, () => assert.equal(evaluateCommand(command).blocked, true));
  }

  const allowed = [
    'git status',
    'git push --set-upstream origin feat/US-001-main-page',
    'git restore --staged apps/api/src/a.ts',
    'gh pr create --base main --title "feat: x [US-001]"',
    'gh pr view 12',
    'pnpm test'
  ];
  for (const command of allowed) {
    it(`allows: ${command}`, () =>
      assert.equal(evaluateCommand(command, { currentBranch: 'feat/x' }).blocked, false));
  }

  it('blocks commits directly on the base branch', () => {
    assert.equal(
      evaluateCommand('git commit -m "x"', { currentBranch: 'main' }).rule,
      'work-on-base'
    );
    assert.equal(
      evaluateCommand('git commit -m "x"', { currentBranch: 'feat/US-001-x' }).blocked,
      false
    );
  });

  it('blocks MCP merge tools', () => {
    assert.equal(
      evaluateToolCall({ tool_name: 'mcp__github__merge_pull_request' }, {}).blocked,
      true
    );
    assert.equal(
      evaluateToolCall({ tool_name: 'mcp__github__create_pull_request' }, {}).blocked,
      false
    );
  });
});

describe('hook scripts', () => {
  const runHook = (script, payload, env = {}) =>
    spawnSync(process.execPath, [path.join(hooksDir, script)], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, ...env }
    });

  it('guard-command exits 2 with a block decision for merges', () => {
    const result = runHook('guard-command.mjs', {
      tool_name: 'exec',
      tool_input: { command: 'gh pr merge 1' }
    });
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).decision, 'block');
  });

  it('guard-command exits 0 silently for safe commands', () => {
    const result = runHook('guard-command.mjs', {
      tool_name: 'exec',
      tool_input: { command: 'git status' }
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
  });

  it('session-start stores the Devin session id', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'nuvio-session-'));
    try {
      const result = runHook(
        'session-start.mjs',
        { session_id: 'abc-123' },
        { DEVIN_PROJECT_DIR: dir }
      );
      assert.equal(result.status, 0);
      assert.equal(
        JSON.parse(readFileSync(path.join(dir, '.nuvio', 'session.json'), 'utf8')).sessionId,
        'abc-123'
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
