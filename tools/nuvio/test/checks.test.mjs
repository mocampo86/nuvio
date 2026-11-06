import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkFocusedTests,
  checkForbiddenFiles,
  checkMigrations,
  checkPrTitle,
  checkTestRemoval,
  scanSecrets
} from '../lib/checks.mjs';
import { parseAddedLines, parseNameStatus } from '../lib/git.mjs';

const line = (text, file = 'apps/api/src/config.ts') => ({ file, line: 1, text });
const fakeGithubToken = ['ghp', '_', 'a'.repeat(36)].join('');
const fakePrivateKey = ['-----BEGIN', ' RSA PRIVATE', ' KEY-----'].join('');

describe('scanSecrets', () => {
  it('detects tokens and private keys without echoing the value', () => {
    const result = scanSecrets([
      line(`const token = "${fakeGithubToken}";`),
      line(fakePrivateKey, 'key.txt')
    ]);
    assert.equal(result.status, 'fail');
    assert.equal(result.details.length, 2);
    assert.ok(result.details.every((detail) => !detail.includes(fakeGithubToken)));
  });

  it('detects hardcoded credentials but ignores placeholders and env references', () => {
    assert.equal(scanSecrets([line(`const password = "${'S3cr3tValue!'}";`)]).status, 'fail');
    assert.equal(scanSecrets([line('const password = "<your-password>";')]).status, 'pass');
    assert.equal(scanSecrets([line('const password = process.env.DB_PASSWORD;')]).status, 'pass');
    const connection = ['Server=db.example;Database=nuvio;', 'Password=', 'Sup3rS3cret'].join('');
    assert.equal(scanSecrets([line(`const cs = '${connection}';`)]).status, 'fail');
    assert.equal(
      scanSecrets([line("const cs = 'Server=db;Password={DB_PASSWORD}';")]).status,
      'pass'
    );
  });

  it('honours the explicit allow marker', () => {
    assert.equal(scanSecrets([line(`"${fakeGithubToken}" // nuvio-allow-secret`)]).status, 'pass');
  });
});

describe('file checks', () => {
  it('rejects sensitive files but allows .env.example', () => {
    const result = checkForbiddenFiles([
      { status: 'A', path: '.env' },
      { status: 'A', path: 'apps/api/local.settings.json' },
      { status: 'A', path: '.env.example' },
      { status: 'D', path: 'old/.env.local' }
    ]);
    assert.equal(result.status, 'fail');
    assert.equal(result.details.length, 2);
  });

  it('allows new migrations and blocks edits unless authorized', () => {
    const pattern = '(^|/)migrations/';
    const added = [{ status: 'A', path: 'packages/database/migrations/002_add.sql' }];
    const edited = [{ status: 'M', path: 'packages/database/migrations/001_init.sql' }];
    assert.equal(checkMigrations(added, pattern, false).status, 'pass');
    assert.equal(checkMigrations(edited, pattern, false).status, 'fail');
    assert.equal(checkMigrations(edited, pattern, true).status, 'warn');
  });

  it('blocks deleted tests unless authorized', () => {
    const files = [{ status: 'D', path: 'apps/api/test/health.test.ts' }];
    assert.equal(checkTestRemoval(files, false).status, 'fail');
    assert.equal(checkTestRemoval(files, true).status, 'warn');
    assert.equal(
      checkTestRemoval([{ status: 'D', path: 'apps/api/src/old.ts' }], false).status,
      'pass'
    );
  });

  it('fails on focused tests and warns on skipped tests', () => {
    const focused = `${['it', 'only'].join('.')}('x', () => {})`;
    const skipped = `${['it', 'skip'].join('.')}('x', () => {})`;
    assert.equal(checkFocusedTests([line(focused, 'a/test/x.test.ts')]).status, 'fail');
    assert.equal(checkFocusedTests([line(skipped, 'a/test/x.test.ts')]).status, 'warn');
    assert.equal(checkFocusedTests([line(focused, 'src/not-a-test.ts')]).status, 'pass');
  });
});

describe('checkPrTitle', () => {
  it('accepts Conventional Commits titles with a US reference', () => {
    assert.equal(
      checkPrTitle('feat(reservations): implement booking creation [US-001]').status,
      'pass'
    );
    assert.equal(checkPrTitle('fix: prevent double booking [US-012]').status, 'pass');
  });

  it('rejects titles without type or US reference', () => {
    assert.equal(checkPrTitle('Implement booking creation').status, 'fail');
    assert.equal(checkPrTitle('feat(reservations): implement booking creation').status, 'fail');
    assert.equal(checkPrTitle('Feat(Reservations): x [US-001]').status, 'fail');
  });
});

describe('git parsers', () => {
  it('parses name-status output including renames', () => {
    assert.deepEqual(parseNameStatus('M\ta.ts\nR100\told.test.ts\tnew.ts\nA\tb.ts'), [
      { status: 'M', path: 'a.ts' },
      { status: 'R', oldPath: 'old.test.ts', path: 'new.ts' },
      { status: 'A', path: 'b.ts' }
    ]);
  });

  it('parses added lines with their line numbers', () => {
    const diff = [
      'diff --git a/x.ts b/x.ts',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,0 +5,2 @@',
      '+one',
      '+two'
    ].join('\n');
    assert.deepEqual(parseAddedLines(diff), [
      { file: 'x.ts', line: 5, text: 'one' },
      { file: 'x.ts', line: 6, text: 'two' }
    ]);
  });
});
