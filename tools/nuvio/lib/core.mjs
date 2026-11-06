import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const EXIT = {
  ok: 0,
  failure: 1,
  usage: 2,
  limitReached: 3,
  unsafeWorkingTree: 4,
  githubUnavailable: 5
};

export class NuvioError extends Error {
  constructor(message, exitCode = EXIT.failure) {
    super(message);
    this.exitCode = exitCode;
  }
}

export function run(command, args, { cwd, allowFailure = false, input, env } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    input,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true
  });
  if (result.error) {
    if (allowFailure) return { code: 127, stdout: '', stderr: result.error.message };
    throw new NuvioError(`No se pudo ejecutar "${command}": ${result.error.message}`);
  }
  const output = {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };
  if (output.code !== 0 && !allowFailure) {
    const detail = (output.stderr || output.stdout).trim();
    throw new NuvioError(`"${command} ${args.join(' ')}" falló (código ${output.code}): ${detail}`);
  }
  return output;
}

export function runShell(commandLine, { cwd }) {
  const startedAt = Date.now();
  const result = spawnSync(commandLine, {
    cwd,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true
  });
  return {
    code: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? result.error.message : ''}`,
    durationMs: Date.now() - startedAt
  };
}

export function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function readText(file) {
  return readFileSync(file, 'utf8');
}

export function writeText(file, content) {
  ensureDir(path.dirname(file));
  writeFileSync(file, content, 'utf8');
}

export function readJson(file, fallback) {
  if (!existsSync(file)) {
    if (fallback !== undefined) return fallback;
    throw new NuvioError(`No existe el archivo ${file}`);
  }
  try {
    return JSON.parse(readText(file).replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new NuvioError(`JSON inválido en ${file}: ${error.message}`);
  }
}

export function writeJson(file, value) {
  writeText(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function loadConfig() {
  const configFile = process.env.NUVIO_CONFIG ?? path.join(TOOL_DIR, 'config.json');
  return readJson(configFile);
}

export function nowIso() {
  return new Date().toISOString();
}

export function tail(text, lines = 40) {
  return text.trimEnd().split(/\r?\n/).slice(-lines).join('\n');
}

export function toPosix(file) {
  return file.replace(/\\/g, '/');
}
