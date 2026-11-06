import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const projectDir = process.env.DEVIN_PROJECT_DIR ?? process.cwd();
const nuvioDir = path.join(projectDir, '.nuvio');

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const payload = readJson(0) ?? {};
mkdirSync(nuvioDir, { recursive: true });
if (payload.session_id) {
  writeFileSync(
    path.join(nuvioDir, 'session.json'),
    `${JSON.stringify({ sessionId: payload.session_id, startedAt: new Date().toISOString() }, null, 2)}\n`
  );
}

const pointer = path.join(nuvioDir, 'current-run');
const runId = existsSync(pointer) ? readFileSync(pointer, 'utf8').trim() : '';
const state = runId ? readJson(path.join(nuvioDir, 'runs', runId, 'state.json')) : null;

if (state && !['pr-created', 'abandoned'].includes(state.stage)) {
  const context = `Ejecución Nuvio activa: ${state.runId} (${state.usId} - ${state.title}) en etapa "${state.stage}". Para continuarla usar /nuvio-resume; para consultar /nuvio-status.`;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context }
    })
  );
}
