import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractUsTag, inferBranchType, PR_TITLE_PATTERN, resolvePrTitle } from '../lib/checks.mjs';

describe('extractUsTag', () => {
  it('normalizes US identifiers from free text', () => {
    assert.equal(extractUsTag('US-050'), 'US-050');
    assert.equal(extractUsTag('us-50'), 'US-050');
    assert.equal(extractUsTag('US_7'), 'US-007');
    assert.equal(extractUsTag('US 050'), 'US-050');
    assert.equal(extractUsTag('us7'), 'US-007');
    assert.equal(extractUsTag('50'), 'US-050');
    assert.equal(extractUsTag('feat: add search [us-12]'), 'US-012');
    assert.equal(extractUsTag('no identifier'), null);
    assert.equal(extractUsTag(undefined), null);
  });
});

describe('inferBranchType', () => {
  it('reads the conventional type prefix only', () => {
    assert.equal(inferBranchType('fix/US-050-review-findings'), 'fix');
    assert.equal(inferBranchType('feat/US-001-booking-creation'), 'feat');
    assert.equal(inferBranchType('chore/devin-automation'), 'chore');
    assert.equal(inferBranchType('US-050-review-findings'), undefined);
    assert.equal(inferBranchType(undefined), undefined);
  });
});

describe('resolvePrTitle', () => {
  it('returns valid titles unchanged', () => {
    const title = 'fix(ci): resolve review findings [US-050]';
    assert.equal(resolvePrTitle(title, { usId: 'US-050' }), title);
    assert.equal(
      resolvePrTitle('feat(reservations)!: implement booking creation [US-001]', {
        usId: 'US-001'
      }),
      'feat(reservations)!: implement booking creation [US-001]'
    );
  });

  it('rebuilds a branch-derived title (the reported bug)', () => {
    const title = resolvePrTitle('Fix/us 050 review findings', { usId: 'US-050', type: 'fix' });
    assert.equal(title, 'fix: review findings [US-050]');
  });

  it('regenerates titles missing type or US tag', () => {
    assert.equal(
      resolvePrTitle('resolve review findings', { usId: 'US-050', type: 'fix', scope: 'ci' }),
      'fix(ci): resolve review findings [US-050]'
    );
    assert.equal(
      resolvePrTitle('fix(api): normalize error handling', { usId: 'US-7' }),
      'fix(api): normalize error handling [US-007]'
    );
  });

  it('normalizes malformed US tags inside the title', () => {
    const title = resolvePrTitle('fix(api): normalize error handling [us_7]', {
      usId: 'US-007'
    });
    assert.equal(title, 'fix(api): normalize error handling [US-007]');
  });

  it('uses the US title as description fallback', () => {
    const title = resolvePrTitle(undefined, {
      usId: 'US-001',
      type: 'feat',
      description: 'Booking Creation'
    });
    assert.equal(title, 'feat: booking creation [US-001]');
  });

  it('never produces an invalid title', () => {
    const cases = [
      ['Fix/us 050 review findings', { usId: 'US-050' }],
      ['something random', { usId: 'US-001', description: 'User Story Title' }],
      [undefined, { usId: 'US-003' }],
      ['docs: ' + 'x'.repeat(200) + ' [US-009]', { usId: 'US-009' }]
    ];
    for (const [input, context] of cases) {
      assert.match(resolvePrTitle(input, context), PR_TITLE_PATTERN, `input: ${input}`);
    }
  });

  it('truncates long descriptions on a word boundary', () => {
    const title = resolvePrTitle(`fix: ${'word '.repeat(40)}end [US-050]`, { usId: 'US-050' });
    assert.ok(title.length <= 105);
    assert.match(title, PR_TITLE_PATTERN);
  });
});
