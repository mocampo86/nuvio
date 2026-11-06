import { existsSync } from 'node:fs';
import { EXIT, NuvioError, run } from './core.mjs';

const WINDOWS_GH_CANDIDATES = [
  'C:\\Program Files\\GitHub CLI\\gh.exe',
  'C:\\Program Files (x86)\\GitHub CLI\\gh.exe'
];

export function resolveGh() {
  if (process.env.NUVIO_GH) return process.env.NUVIO_GH;
  if (run('gh', ['--version'], { allowFailure: true }).code === 0) return 'gh';
  const candidate = WINDOWS_GH_CANDIDATES.find((file) => existsSync(file));
  if (candidate) return candidate;
  throw new NuvioError(
    'GitHub CLI (gh) no está instalado. En Windows: winget install GitHub.cli',
    EXIT.githubUnavailable
  );
}

export function gh(root, args, options = {}) {
  return run(resolveGh(), args, { cwd: root, ...options });
}

export function ensureGhAuth(root) {
  const status = gh(root, ['auth', 'status'], { allowFailure: true });
  if (status.code !== 0) {
    throw new NuvioError(
      'GitHub CLI no está autenticado. Ejecutá: gh auth login',
      EXIT.githubUnavailable
    );
  }
}

export function findPullRequests(root, branch) {
  const output = gh(root, [
    'pr',
    'list',
    '--head',
    branch,
    '--state',
    'all',
    '--json',
    'number,url,state,title'
  ]).stdout;
  return JSON.parse(output || '[]');
}

export function parsePrUrl(output) {
  const match = /https:\/\/github\.com\/\S+\/pull\/(\d+)/.exec(output);
  if (!match)
    throw new NuvioError(`No se pudo obtener la URL del PR de la salida: ${output.trim()}`);
  return { url: match[0], number: Number(match[1]) };
}

export function branchProtectionPayload(requiredChecks) {
  return {
    required_status_checks: { strict: true, contexts: requiredChecks },
    enforce_admins: true,
    required_pull_request_reviews: {
      required_approving_review_count: 0,
      dismiss_stale_reviews: true
    },
    restrictions: null,
    required_linear_history: false,
    allow_force_pushes: false,
    allow_deletions: false,
    required_conversation_resolution: true
  };
}
