import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applySelection,
  evaluateFindings,
  mergeReviewRound,
  normalizeFinding
} from '../lib/findings.mjs';

const finding = (overrides) => ({
  id: 'REV-001',
  severity: 'Medium',
  category: 'maintainability',
  file: 'apps/api/src/a.ts',
  location: 'L10',
  title: 'Title',
  description: 'Description',
  evidence: 'Evidence',
  impact: 'Impact',
  recommendedFix: 'Fix',
  rationale: 'Rationale',
  ...overrides
});

describe('normalizeFinding', () => {
  it('forces blocking for critical, acceptance, tenant isolation and high security findings', () => {
    assert.equal(normalizeFinding(finding({ severity: 'Critical' })).blocking, true);
    assert.equal(
      normalizeFinding(finding({ category: 'acceptance', severity: 'Low' })).blocking,
      true
    );
    assert.equal(
      normalizeFinding(finding({ category: 'tenant-isolation', severity: 'Medium' })).blocking,
      true
    );
    assert.equal(
      normalizeFinding(finding({ category: 'security', severity: 'High' })).blocking,
      true
    );
    assert.equal(
      normalizeFinding(finding({ category: 'security', severity: 'Medium' })).blocking,
      false
    );
    assert.equal(
      normalizeFinding(finding({ blocking: false, severity: 'Critical' })).blocking,
      true
    );
  });

  it('rejects incomplete or malformed findings', () => {
    assert.throws(() => normalizeFinding(finding({ evidence: '' })), /evidence/);
    assert.throws(() => normalizeFinding(finding({ id: 'R-1' })), /ID inválido/);
    assert.throws(() => normalizeFinding(finding({ severity: 'Blocker' })), /severidad/);
  });
});

describe('review rounds', () => {
  it('keeps user decisions across rounds and carries unreported findings', () => {
    const previous = [
      { ...normalizeFinding(finding({ id: 'REV-001' })), decision: 'rejected' },
      { ...normalizeFinding(finding({ id: 'REV-002' })), decision: 'approved' }
    ];
    const { findings, warnings } = mergeReviewRound(previous, [
      finding({ id: 'REV-001' }),
      finding({ id: 'REV-003' })
    ]);
    assert.equal(findings.find((f) => f.id === 'REV-001').decision, 'rejected');
    assert.equal(findings.find((f) => f.id === 'REV-003').decision, null);
    assert.ok(findings.some((f) => f.id === 'REV-002'));
    assert.equal(warnings.length, 1);
  });

  it('rejects duplicated IDs', () => {
    assert.throws(() => mergeReviewRound([], [finding({}), finding({})]), /duplicado/);
  });
});

describe('fix selection', () => {
  const findings = [
    normalizeFinding(finding({ id: 'REV-001', severity: 'Critical', category: 'security' })),
    normalizeFinding(finding({ id: 'REV-002' })),
    normalizeFinding(finding({ id: 'REV-003', severity: 'Low' }))
  ];

  it('applies all, blocking-only and explicit ID selections', () => {
    assert.deepEqual(applySelection(findings, 'all').approved, ['REV-001', 'REV-002', 'REV-003']);
    const blocking = applySelection(findings, 'blocking');
    assert.deepEqual(blocking.approved, ['REV-001']);
    assert.deepEqual(blocking.rejected, ['REV-002', 'REV-003']);
    const explicit = applySelection(findings, 'rev-001, REV-003');
    assert.deepEqual(explicit.approved, ['REV-001', 'REV-003']);
    assert.deepEqual(explicit.rejected, ['REV-002']);
  });

  it('flags rejected blocking findings and unknown IDs', () => {
    assert.deepEqual(applySelection(findings, 'REV-002').rejectedBlocking, ['REV-001']);
    assert.throws(() => applySelection(findings, 'REV-999'), /desconocidos/);
  });

  it('only re-decides undecided findings unless they are listed explicitly', () => {
    const { findings: round1 } = applySelection(findings, 'REV-001, REV-002');
    const round2 = [...round1, normalizeFinding(finding({ id: 'REV-004', severity: 'Low' }))];
    const result = applySelection(round2, 'none');
    assert.equal(result.findings.find((f) => f.id === 'REV-002').decision, 'approved');
    assert.equal(result.findings.find((f) => f.id === 'REV-004').decision, 'rejected');
    assert.equal(
      applySelection(result.findings, 'REV-004').findings.find((f) => f.id === 'REV-004').decision,
      'approved'
    );
  });

  it('never lets a rejected blocking finding pass the evaluation', () => {
    const { findings: decided } = applySelection(findings, 'none');
    const evaluation = evaluateFindings(decided);
    assert.deepEqual(
      evaluation.blockingOpen.map((f) => f.id),
      ['REV-001']
    );
    assert.deepEqual(
      evaluation.acceptedRisks.map((f) => f.id),
      ['REV-002', 'REV-003']
    );
  });
});
