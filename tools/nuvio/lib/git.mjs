import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { NuvioError, run } from './core.mjs';

const MAX_SCANNED_FILE_BYTES = 1024 * 1024;

export function git(root, args, options = {}) {
  return run('git', ['-c', 'core.quotepath=false', ...args], { cwd: root, ...options });
}

export function gitOut(root, args) {
  return git(root, args).stdout.trim();
}

export function findRepoRoot(cwd = process.cwd()) {
  const result = run('git', ['rev-parse', '--show-toplevel'], { cwd, allowFailure: true });
  if (result.code !== 0)
    throw new NuvioError('El directorio actual no pertenece a un repositorio Git.');
  return path.resolve(result.stdout.trim());
}

export function currentBranch(root) {
  return gitOut(root, ['branch', '--show-current']);
}

export function headSha(root) {
  return gitOut(root, ['rev-parse', 'HEAD']);
}

export function workingTreeChanges(root) {
  return gitOut(root, ['status', '--porcelain']).split(/\r?\n/).filter(Boolean);
}

export function localBranchExists(root, branch) {
  return (
    git(root, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { allowFailure: true })
      .code === 0
  );
}

export function remoteBranchExists(root, remote, branch) {
  return (
    git(root, ['show-ref', '--verify', '--quiet', `refs/remotes/${remote}/${branch}`], {
      allowFailure: true
    }).code === 0
  );
}

export function hasRemote(root, remote) {
  return git(root, ['remote', 'get-url', remote], { allowFailure: true }).code === 0;
}

export function resolveBaseRef(root, config) {
  if (process.env.NUVIO_BASE_REF) return process.env.NUVIO_BASE_REF;
  return remoteBranchExists(root, config.remote, config.baseBranch)
    ? `${config.remote}/${config.baseBranch}`
    : config.baseBranch;
}

export function mergeBase(root, baseRef) {
  const result = git(root, ['merge-base', baseRef, 'HEAD'], { allowFailure: true });
  if (result.code !== 0) throw new NuvioError(`No se pudo calcular el merge-base con ${baseRef}.`);
  return result.stdout.trim();
}

function untrackedFiles(root) {
  return gitOut(root, ['ls-files', '--others', '--exclude-standard'])
    .split(/\r?\n/)
    .filter(Boolean);
}

export function parseNameStatus(output) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [status, first, second] = line.split('\t');
      const code = status[0];
      return code === 'R' || code === 'C'
        ? { status: code, oldPath: first, path: second }
        : { status: code, path: first };
    });
}

export function changedFiles(root, base, { includeWorkingTree }) {
  const range = includeWorkingTree ? [base] : [base, 'HEAD'];
  const tracked = parseNameStatus(gitOut(root, ['diff', '--name-status', '-M', ...range]));
  if (!includeWorkingTree) return tracked;
  return [...tracked, ...untrackedFiles(root).map((file) => ({ status: 'A', path: file }))];
}

export function parseAddedLines(diff) {
  const added = [];
  let file = null;
  let lineNumber = 0;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith('+++ ')) {
      file = line === '+++ /dev/null' ? null : line.replace(/^\+\+\+ b\//, '');
    } else if (line.startsWith('@@')) {
      lineNumber = Number(/\+(\d+)/.exec(line)?.[1] ?? 0);
    } else if (file && line.startsWith('+')) {
      added.push({ file, line: lineNumber, text: line.slice(1) });
      lineNumber += 1;
    }
  }
  return added;
}

export function addedLines(root, base, { includeWorkingTree }) {
  const range = includeWorkingTree ? [base] : [base, 'HEAD'];
  const diff = git(root, ['diff', '-U0', '--no-color', '--no-ext-diff', ...range]).stdout;
  const lines = parseAddedLines(diff);
  if (!includeWorkingTree) return lines;
  for (const file of untrackedFiles(root)) {
    const absolute = path.join(root, file);
    if (!existsSync(absolute) || statSync(absolute).size > MAX_SCANNED_FILE_BYTES) continue;
    const content = readFileSync(absolute, 'utf8');
    if (content.includes('\u0000')) continue;
    content.split(/\r?\n/).forEach((text, index) => lines.push({ file, line: index + 1, text }));
  }
  return lines;
}

export function fullDiff(root, base) {
  return git(root, ['diff', '--no-color', '--no-ext-diff', '-M', base, 'HEAD']).stdout;
}

export function diffStat(root, base) {
  return gitOut(root, ['diff', '--stat', '-M', base, 'HEAD']);
}
