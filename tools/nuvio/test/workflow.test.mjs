import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const toolDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(toolDir, '..', '..');
const cli = path.join(toolDir, 'cli.mjs');

const gitEnv = {
  GIT_AUTHOR_NAME: 'Nuvio Test',
  GIT_AUTHOR_EMAIL: 'test@nuvio.invalid',
  GIT_COMMITTER_NAME: 'Nuvio Test',
  GIT_COMMITTER_EMAIL: 'test@nuvio.invalid'
};

const passing = 'node -e "process.exit(0)"';
const failing = 'node -e "process.exit(1)"';

function makeConfig(dir, name, command, maxFixAttempts = 3) {
  const file = path.join(dir, `${name}.json`);
  const steps = [{ name: 'check', command, required: true }];
  writeFileSync(
    file,
    JSON.stringify({
      baseBranch: 'main',
      remote: 'origin',
      runsDir: '.nuvio/runs',
      userStoriesDir: 'docs/user-stories',
      maxFixAttempts,
      maxReviewRounds: 3,
      migrationPathPattern: '(^|/)migrations/',
      validation: { quick: steps, full: steps }
    })
  );
  return file;
}

const finding = (overrides) => ({
  id: 'REV-001',
  severity: 'High',
  category: 'security',
  file: 'src/feature.js',
  location: 'L1',
  title: 'Missing tenant check',
  description: 'The handler does not verify the tenant.',
  evidence: 'src/feature.js:1 reads salonId from the request body.',
  impact: 'Cross-tenant data access.',
  recommendedFix: 'Derive salonId from the authenticated principal.',
  rationale: 'Tenant isolation is a core invariant.',
  ...overrides
});

describe('end-to-end run lifecycle (local, no GitHub)', () => {
  let sandbox;
  let work;
  let okConfig;
  let failConfig;

  const sh = (command, args) => {
    const result = spawnSync(command, args, {
      cwd: work,
      encoding: 'utf8',
      env: { ...process.env, ...gitEnv }
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const nuvio = (args, config = okConfig, extraEnv = {}) =>
    spawnSync(process.execPath, [cli, ...args], {
      cwd: work,
      encoding: 'utf8',
      env: { ...process.env, ...gitEnv, NUVIO_CONFIG: config, ...extraEnv }
    });
  const state = () => {
    const runId = readFileSync(path.join(work, '.nuvio', 'current-run'), 'utf8').trim();
    return JSON.parse(readFileSync(path.join(work, '.nuvio', 'runs', runId, 'state.json'), 'utf8'));
  };
  const runPath = (...segments) => path.join(work, '.nuvio', 'runs', state().runId, ...segments);
  const commit = (file, content, message) => {
    mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
    writeFileSync(path.join(work, file), content);
    sh('git', ['add', '-A']);
    sh('git', ['commit', '-m', message]);
  };

  before(() => {
    sandbox = mkdtempSync(path.join(os.tmpdir(), 'nuvio-e2e-'));
    work = path.join(sandbox, 'work');
    mkdirSync(work);
    spawnSync('git', ['init', '--bare', '-b', 'main', path.join(sandbox, 'remote.git')]);
    sh('git', ['init', '-b', 'main']);
    writeFileSync(path.join(work, '.gitignore'), '.nuvio/\n');
    commit('README.md', '# demo\n', 'chore: initial commit');
    sh('git', ['remote', 'add', 'origin', path.join(sandbox, 'remote.git')]);
    sh('git', ['push', '-u', 'origin', 'main']);
    okConfig = makeConfig(sandbox, 'ok', passing);
    failConfig = makeConfig(sandbox, 'fail', failing, 1);
    mkdirSync(path.join(work, 'docs', 'user-stories'), { recursive: true });
    writeFileSync(
      path.join(work, 'docs', 'user-stories', 'US-900-demo.md'),
      '# US-900: Demo booking\n\nGiven a client\nWhen it books\nThen the slot is blocked\n'
    );
  });

  after(() => rmSync(sandbox, { recursive: true, force: true }));

  it('creates a run and reuses it idempotently', () => {
    assert.equal(nuvio(['init', '--us', 'US-900']).status, 0);
    const first = state().runId;
    assert.equal(nuvio(['init', '--us', 'us-900']).status, 0);
    assert.equal(state().runId, first);
    assert.equal(state().title, 'Demo booking');
    assert.ok(existsSync(runPath('user-story.md')));
  });

  it('refuses to create the branch before analysis is complete', () => {
    assert.equal(nuvio(['branch']).status, 2);
  });

  it('never overwrites uncommitted user changes when creating the branch', () => {
    writeFileSync(runPath('plan.md'), '# Plan\n');
    assert.equal(nuvio(['ac', 'add', '--id', 'AC-1', '--text', 'Slot is blocked']).status, 0);
    writeFileSync(path.join(work, 'README.md'), '# local change\n');
    const result = nuvio(['branch', '--slug', 'demo-booking']);
    assert.equal(result.status, 4, result.stderr);
    assert.equal(sh('git', ['branch', '--show-current']), 'main');
    assert.equal(readFileSync(path.join(work, 'README.md'), 'utf8'), '# local change\n');
    sh('git', ['checkout', 'README.md']);
  });

  it('creates and then reuses the branch', () => {
    assert.equal(nuvio(['branch', '--slug', 'demo-booking']).status, 0);
    assert.equal(sh('git', ['branch', '--show-current']), 'feat/US-900-demo-booking');
    assert.equal(state().stage, 'implementation');
    assert.equal(nuvio(['branch']).status, 0);
    assert.equal(sh('git', ['branch', '--list']).split('\n').length, 2);
  });

  it('limits self-correction attempts and blocks the run', () => {
    commit('src/feature.js', 'export const feature = 1;\n', 'feat: add feature [US-900]');
    assert.equal(nuvio(['validate', '--mode', 'full'], failConfig).status, 1);
    const second = nuvio(['validate', '--mode', 'full'], failConfig);
    assert.equal(second.status, 3, second.stderr);
    assert.equal(state().stage, 'blocked');
    assert.equal(nuvio(['stage', 'implementation', '--note', 'user fixed env']).status, 0);
  });

  it('detects secrets during validation', () => {
    writeFileSync(
      path.join(work, 'src', 'leak.js'),
      `export const t = "${['ghp', '_', 'b'.repeat(36)].join('')}";\n`
    );
    const result = nuvio(['validate', '--mode', 'quick']);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /secret-scan/);
    rmSync(path.join(work, 'src', 'leak.js'));
  });

  it('runs the review → fix selection → re-review loop and enforces the gates', () => {
    assert.equal(nuvio(['review-prepare']).status, 2, 'review requires a passing full validation');
    assert.equal(nuvio(['validate', '--mode', 'full']).status, 0);
    assert.equal(nuvio(['review-prepare']).status, 0);
    assert.ok(existsSync(runPath('review', 'diff.patch')));

    const round1 = path.join(sandbox, 'round1.json');
    writeFileSync(
      round1,
      JSON.stringify({
        summary: 'Round 1',
        findings: [
          finding({}),
          finding({ id: 'REV-002', severity: 'Low', category: 'maintainability', title: 'Naming' })
        ]
      })
    );
    assert.equal(nuvio(['review-save', '--file', round1]).status, 0);
    assert.equal(state().stage, 'fix-selection');
    assert.equal(nuvio(['gate']).status, 1);

    assert.equal(nuvio(['select-fixes', '--selection', 'REV-001']).status, 0);
    assert.equal(state().stage, 'fixing');

    commit('src/feature.js', 'export const feature = 2;\n', 'fix: enforce tenant [US-900]');
    assert.equal(nuvio(['validate', '--mode', 'full']).status, 0);
    assert.equal(nuvio(['review-prepare']).status, 0);
    const round2 = path.join(sandbox, 'round2.json');
    writeFileSync(
      round2,
      JSON.stringify({
        findings: [
          finding({ status: 'fixed' }),
          finding({ id: 'REV-002', severity: 'Low', category: 'maintainability', title: 'Naming' })
        ]
      })
    );
    assert.equal(nuvio(['review-save', '--file', round2]).status, 0);
    assert.equal(state().stage, 'ready-for-pr');
    assert.equal(nuvio(['review-prepare']).status, 2, 'no repeated review without changes');

    const gate = nuvio(['gate']);
    assert.equal(gate.status, 1);
    assert.match(gate.stdout, /AC-1/);
    assert.match(gate.stdout, /review-report/);

    assert.equal(
      nuvio(['ac', 'set', '--id', 'AC-1', '--status', 'met']).status,
      2,
      'evidence is mandatory'
    );
    assert.equal(
      nuvio(['ac', 'set', '--id', 'AC-1', '--status', 'met', '--evidence', 'feature.test.js'])
        .status,
      0
    );
    writeFileSync(runPath('review-report.md'), '# Report\nREV-001 fixed\nREV-002 accepted\n');
    const passingGate = nuvio(['gate']);
    assert.equal(passingGate.status, 0, passingGate.stdout);
  });

  it('validates the PR title and body and supports a dry run without remote actions', () => {
    const autoTitled = nuvio(['pr', '--title', 'Add booking', '--dry-run']);
    assert.equal(autoTitled.status, 2, autoTitled.stderr);
    assert.match(autoTitled.stdout, /feat: add booking \[US-900\]/);
    assert.equal(
      nuvio(['pr', '--title', 'feat(reservations): demo booking [US-900]', '--dry-run']).status,
      2
    );
    writeFileSync(runPath('pr-body.md'), 'Implements US-900\n');
    const dryRun = nuvio([
      'pr',
      '--title',
      'feat(reservations): demo booking [US-900]',
      '--dry-run'
    ]);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /dry-run/);
    assert.equal(state().stage, 'ready-for-pr');
    const remoteBranches = spawnSync('git', ['ls-remote', '--heads', 'origin'], {
      cwd: work,
      encoding: 'utf8'
    }).stdout;
    assert.doesNotMatch(remoteBranches, /US-900/);
  });

  it('runs the CI gate on the committed diff', () => {
    const result = nuvio(['gate', '--ci'], okConfig, {
      NUVIO_PR_TITLE: 'feat(reservations): demo booking [US-900]'
    });
    assert.equal(result.status, 0, result.stdout);
    const badTitle = nuvio(['gate', '--ci'], okConfig, { NUVIO_PR_TITLE: 'demo' });
    assert.equal(badTitle.status, 1);
  });
});

describe('repository automation configuration', () => {
  it('passes the doctor checks (skills, agents, hooks, config)', () => {
    const result = spawnSync(process.execPath, [cli, 'doctor'], {
      cwd: repoRoot,
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  });
});
