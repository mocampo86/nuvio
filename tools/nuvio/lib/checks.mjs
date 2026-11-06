const ALLOW_SECRET_MARKER = 'nuvio-allow-secret';

const SECRET_RULES = [
  {
    id: 'private-key',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----/
  },
  {
    id: 'github-token',
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}/
  },
  { id: 'aws-access-key', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'azure-storage-key', pattern: /AccountKey=[A-Za-z0-9+/=]{40,}/ },
  { id: 'azure-sas-signature', pattern: /[?&]sig=[A-Za-z0-9%+/=]{30,}/ },
  { id: 'google-oauth-client-secret', pattern: /\bGOCSPX-[A-Za-z0-9_-]{20,}/ },
  { id: 'google-api-key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'slack-token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { id: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  {
    id: 'connection-string-password',
    pattern:
      /\b(?:Server|Host|Data Source|AccountName)\s*=[^;]+;.*\b(?:Password|Pwd)\s*=\s*(?!\{|\$|<)[^;'"\s]{6,}/i
  },
  {
    id: 'hardcoded-credential',
    pattern:
      /\b(?:secret|password|passwd|api[_-]?key|access[_-]?token|client[_-]?secret)\b["']?\s*[:=]\s*["']([^"'\s]{8,})["']/i,
    isPlaceholder: (match) =>
      /^(?:<.*>|\$\{.*\}|x{6,}|\*{6,}|(?:your|example|placeholder|dummy|changeme|fake|sample)[\w-]*)$/i.test(
        match[1]
      )
  }
];

const SECRET_SCAN_EXCLUDED_FILES = [/(^|\/)pnpm-lock\.yaml$/];

const FORBIDDEN_FILE_PATTERNS = [
  { pattern: /(^|\/)\.env(\.[^/]+)?$/, except: /(^|\/)\.env\.example$/ },
  { pattern: /(^|\/)local\.settings\.json$/ },
  { pattern: /\.(pem|pfx|p12|key|keystore|jks)$/i },
  { pattern: /(^|\/)id_(rsa|ecdsa|ed25519)$/ }
];

const TEST_FILE_PATTERN = /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const FOCUSED_TEST_PATTERN = /\b(?:describe|it|test)\.only\s*\(|\bf(?:it|describe)\s*\(/;
const SKIPPED_TEST_PATTERN = /\b(?:describe|it|test)\.skip\s*\(|\bx(?:it|describe)\s*\(/;

export const PR_TITLE_PATTERN =
  /^(feat|fix|refactor|perf|test|docs|build|ci|chore|style|revert)(\([a-z0-9][a-z0-9-]*\))?!?: \S.{0,90}\S \[US-\d{3,}\]$/;

function result(name, failures, { warnings = [], required = true, passMessage } = {}) {
  const status = failures.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass';
  return {
    name,
    status,
    required,
    details: [...failures, ...warnings],
    summary: passMessage ?? ''
  };
}

export function isTestFile(file) {
  return TEST_FILE_PATTERN.test(file);
}

export function scanSecrets(addedLines) {
  const failures = [];
  for (const { file, line, text } of addedLines) {
    if (text.includes(ALLOW_SECRET_MARKER)) continue;
    if (SECRET_SCAN_EXCLUDED_FILES.some((pattern) => pattern.test(file))) continue;
    for (const rule of SECRET_RULES) {
      const match = rule.pattern.exec(text);
      if (match && !rule.isPlaceholder?.(match)) {
        failures.push(`${file}:${line} posible secreto (${rule.id}). El valor no se muestra.`);
      }
    }
  }
  return result('secret-scan', failures, {
    passMessage: 'Sin secretos detectados en las líneas agregadas.'
  });
}

export function checkForbiddenFiles(files) {
  const failures = files
    .filter(({ status }) => status !== 'D')
    .filter(({ path: file }) =>
      FORBIDDEN_FILE_PATTERNS.some(
        ({ pattern, except }) => pattern.test(file) && !except?.test(file)
      )
    )
    .map(({ path: file }) => `${file}: archivo sensible que no debe versionarse.`);
  return result('forbidden-files', failures);
}

export function checkMigrations(files, migrationPattern, authorized) {
  const pattern = new RegExp(migrationPattern);
  const touched = files.filter(
    ({ status, path: file, oldPath }) =>
      status !== 'A' && (pattern.test(file) || (oldPath && pattern.test(oldPath)))
  );
  const messages = touched.map(
    ({ status, path: file }) =>
      `${file}: migración existente modificada/eliminada (estado ${status}).`
  );
  return authorized
    ? result('migration-safety', [], {
        warnings: messages.map((m) => `${m} Autorizado explícitamente.`)
      })
    : result('migration-safety', messages, {
        passMessage: 'Solo se agregaron migraciones nuevas (o ninguna).'
      });
}

export function checkTestRemoval(files, authorized) {
  const removed = files.filter(
    ({ status, path: file, oldPath }) =>
      (status === 'D' && isTestFile(file)) ||
      (status === 'R' && isTestFile(oldPath) && !isTestFile(file))
  );
  const messages = removed.map(
    ({ path: file, oldPath }) => `${oldPath ?? file}: archivo de test eliminado.`
  );
  return authorized
    ? result('test-removal', [], {
        warnings: messages.map((m) => `${m} Autorizado explícitamente.`)
      })
    : result('test-removal', messages);
}

export function checkFocusedTests(addedLines) {
  const testLines = addedLines.filter(({ file }) => isTestFile(file));
  const failures = testLines
    .filter(({ text }) => FOCUSED_TEST_PATTERN.test(text))
    .map(
      ({ file, line }) => `${file}:${line} test enfocado (.only) que oculta el resto de la suite.`
    );
  const warnings = testLines
    .filter(({ text }) => SKIPPED_TEST_PATTERN.test(text))
    .map(({ file, line }) => `${file}:${line} test deshabilitado (.skip); justificar en el PR.`);
  return result('focused-tests', failures, { warnings });
}

export function checkPrTitle(title) {
  const failures = PR_TITLE_PATTERN.test(title ?? '')
    ? []
    : [
        `Título "${title ?? ''}" inválido. Formato: tipo(scope): descripción [US-000], p. ej. "feat(reservations): implement booking creation [US-001]".`
      ];
  return result('pr-title', failures);
}

export function staticChecks({ files, lines, config, authorizations = {} }) {
  return [
    scanSecrets(lines),
    checkForbiddenFiles(files),
    checkMigrations(files, config.migrationPathPattern, authorizations.migrationEdits === true),
    checkTestRemoval(files, authorizations.testRemoval === true),
    checkFocusedTests(lines)
  ];
}
