import { NuvioError } from './core.mjs';

export const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'];
export const CATEGORIES = [
  'acceptance',
  'bug',
  'security',
  'authorization',
  'tenant-isolation',
  'data-integrity',
  'concurrency',
  'architecture',
  'duplication',
  'tests',
  'scope',
  'performance',
  'maintainability',
  'documentation'
];
const ALWAYS_BLOCKING_CATEGORIES = ['acceptance', 'tenant-isolation'];
const BLOCKING_WHEN_HIGH_CATEGORIES = [
  'security',
  'authorization',
  'data-integrity',
  'concurrency'
];
const REQUIRED_FIELDS = [
  'id',
  'severity',
  'category',
  'file',
  'location',
  'title',
  'description',
  'evidence',
  'impact',
  'recommendedFix',
  'rationale'
];
const ID_PATTERN = /^REV-\d{3,}$/;

export function isForcedBlocking({ severity, category }) {
  return (
    severity === 'Critical' ||
    ALWAYS_BLOCKING_CATEGORIES.includes(category) ||
    (BLOCKING_WHEN_HIGH_CATEGORIES.includes(category) && severity === 'High')
  );
}

export function normalizeFinding(raw) {
  const missing = REQUIRED_FIELDS.filter(
    (field) => typeof raw[field] !== 'string' || raw[field].trim() === ''
  );
  if (missing.length > 0)
    throw new NuvioError(`Hallazgo ${raw.id ?? '(sin id)'}: faltan campos ${missing.join(', ')}.`);
  if (!ID_PATTERN.test(raw.id)) throw new NuvioError(`ID inválido "${raw.id}". Formato: REV-001.`);
  if (!SEVERITIES.includes(raw.severity))
    throw new NuvioError(`${raw.id}: severidad inválida "${raw.severity}".`);
  if (!CATEGORIES.includes(raw.category))
    throw new NuvioError(`${raw.id}: categoría inválida "${raw.category}".`);
  const status = raw.status ?? 'open';
  if (!['open', 'fixed'].includes(status))
    throw new NuvioError(`${raw.id}: estado inválido "${status}".`);
  return {
    ...raw,
    status,
    blocking: raw.blocking === true || isForcedBlocking(raw),
    decision: raw.decision ?? null
  };
}

export function mergeReviewRound(previous, incoming) {
  const ids = new Set();
  for (const finding of incoming) {
    if (ids.has(finding.id)) throw new NuvioError(`ID de hallazgo duplicado: ${finding.id}.`);
    ids.add(finding.id);
  }
  const previousById = new Map(previous.map((finding) => [finding.id, finding]));
  const merged = incoming.map((raw) => {
    const finding = normalizeFinding(raw);
    const decision = previousById.get(finding.id)?.decision ?? finding.decision;
    return { ...finding, decision };
  });
  const carried = previous.filter((finding) => !ids.has(finding.id));
  const warnings = carried.map(
    (finding) =>
      `${finding.id} no fue reportado en esta ronda; se conserva con estado "${finding.status}".`
  );
  return { findings: [...merged, ...carried], warnings };
}

const needsDecision = (finding) =>
  finding.decision === null || (finding.blocking && finding.decision === 'rejected');

export function parseSelection(selection, findings) {
  const normalized = selection.trim().toLowerCase();
  const targets = findings.filter((finding) => finding.status === 'open' && needsDecision(finding));
  if (['all', 'todos', 'todo'].includes(normalized))
    return { targets, approved: new Set(targets.map((f) => f.id)) };
  if (['blocking', 'bloqueantes', 'blocking-only'].includes(normalized)) {
    return { targets, approved: new Set(targets.filter((f) => f.blocking).map((f) => f.id)) };
  }
  if (['none', 'ninguno'].includes(normalized)) return { targets, approved: new Set() };
  const ids = selection
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((id) => id.toUpperCase());
  const unknown = ids.filter((id) => !findings.some((f) => f.id === id && f.status === 'open'));
  if (unknown.length > 0)
    throw new NuvioError(`IDs desconocidos o ya corregidos: ${unknown.join(', ')}.`);
  const listed = findings.filter((f) => ids.includes(f.id) && !targets.includes(f));
  return { targets: [...targets, ...listed], approved: new Set(ids) };
}

export function applySelection(findings, selection) {
  const { targets, approved: approvedIds } = parseSelection(selection, findings);
  const targetIds = new Set(targets.map((f) => f.id));
  const updated = findings.map((finding) =>
    targetIds.has(finding.id)
      ? { ...finding, decision: approvedIds.has(finding.id) ? 'approved' : 'rejected' }
      : finding
  );
  const open = updated.filter((f) => f.status === 'open');
  return {
    findings: updated,
    approved: open.filter((f) => f.decision === 'approved').map((f) => f.id),
    rejected: open.filter((f) => f.decision === 'rejected').map((f) => f.id),
    rejectedBlocking: open.filter((f) => f.decision === 'rejected' && f.blocking).map((f) => f.id)
  };
}

export function evaluateFindings(findings) {
  const open = findings.filter((f) => f.status === 'open');
  return {
    blockingOpen: open.filter((f) => f.blocking),
    approvedPending: open.filter((f) => !f.blocking && f.decision === 'approved'),
    undecided: open.filter((f) => !f.blocking && f.decision === null),
    acceptedRisks: open.filter((f) => !f.blocking && f.decision === 'rejected'),
    fixed: findings.filter((f) => f.status === 'fixed')
  };
}

export function formatFindingsTable(findings) {
  if (findings.length === 0) return 'Sin hallazgos.';
  const rows = findings.map(
    (f) =>
      `| ${f.id} | ${f.severity} | ${f.blocking ? 'Sí' : 'No'} | ${f.status} | ${f.decision ?? '-'} | ${f.file}:${f.location} | ${f.title} |`
  );
  return [
    '| ID | Severidad | Bloquea | Estado | Decisión | Ubicación | Título |',
    '|---|---|---|---|---|---|---|',
    ...rows
  ].join('\n');
}
