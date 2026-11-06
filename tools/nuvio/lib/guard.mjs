const SEGMENT_SEPARATOR = /&&|\|\||[;|\n]/;

const COMMAND_RULES = [
  {
    id: 'pr-merge',
    pattern: /\bgh(?:\.exe)?["']?\s+pr\s+merge\b/i,
    reason: 'El merge de Pull Requests es exclusivamente manual y lo decide el usuario.'
  },
  {
    id: 'api-merge',
    pattern: /\/pulls\/\d+\/merge\b|\bmergePullRequest\b|\benablePullRequestAutoMerge\b/i,
    reason: 'El merge de Pull Requests es exclusivamente manual y lo decide el usuario.'
  },
  {
    id: 'branch-protection-removal',
    pattern: /\bgh(?:\.exe)?["']?\s+api\b.*(?:-X|--method)\s+DELETE\b.*\/protection\b/i,
    reason: 'No se permite eliminar la protección de ramas.'
  },
  {
    id: 'force-push',
    pattern: /\bgit\s+push\b.*(?:\s--force(?:-with-lease)?\b|\s-[a-zA-Z]*f\b|\s\+\S+)/,
    reason: 'Force push reescribe historia remota; requiere aprobación explícita del usuario.'
  },
  {
    id: 'hard-reset',
    pattern: /\bgit\s+reset\b.*\s--hard\b/,
    reason: 'git reset --hard descarta trabajo; requiere aprobación explícita del usuario.'
  },
  {
    id: 'git-clean',
    pattern: /\bgit\s+clean\b.*\s-[a-zA-Z]*f/,
    reason: 'git clean elimina archivos no versionados; requiere aprobación explícita del usuario.'
  },
  {
    id: 'discard-changes',
    pattern: /\bgit\s+checkout\s+(?:\S+\s+)?--\s|\bgit\s+restore\s+(?!.*--staged)/,
    reason: 'Descartar cambios locales requiere aprobación explícita del usuario.'
  },
  {
    id: 'branch-force-delete',
    pattern: /\bgit\s+branch\b.*\s(?:-D|--delete\s+--force|-d\s+--force)\b/,
    reason: 'Eliminar ramas forzadamente requiere aprobación explícita del usuario.'
  },
  {
    id: 'stash-destroy',
    pattern: /\bgit\s+stash\s+(?:drop|clear)\b/,
    reason: 'Eliminar stashes requiere aprobación explícita del usuario.'
  }
];

const MCP_MERGE_TOOL = /merge_pull_request|merge_pr\b|enable_auto_merge/i;

function pushTargetsBase(segment, baseBranch) {
  const match = /\bgit\s+push\b(.*)$/.exec(segment);
  if (!match) return false;
  const tokens = match[1]
    .trim()
    .split(/\s+/)
    .filter((token) => token && !token.startsWith('-'));
  const refspecs = tokens.slice(1);
  return refspecs.some((spec) => {
    const destination = spec.includes(':') ? spec.split(':').pop() : spec;
    return destination === baseBranch || destination === `refs/heads/${baseBranch}`;
  });
}

export function evaluateCommand(command, { currentBranch, baseBranch = 'main' } = {}) {
  const segments = String(command ?? '').split(SEGMENT_SEPARATOR);
  for (const segment of segments) {
    const rule = COMMAND_RULES.find(({ pattern }) => pattern.test(segment));
    if (rule) return { blocked: true, rule: rule.id, reason: rule.reason };
    if (pushTargetsBase(segment, baseBranch)) {
      return {
        blocked: true,
        rule: 'push-base',
        reason: `No se permite pushear directamente a ${baseBranch}.`
      };
    }
    if (
      /\bgit\s+(?:commit|merge|rebase|cherry-pick)\b/.test(segment) &&
      currentBranch === baseBranch
    ) {
      return {
        blocked: true,
        rule: 'work-on-base',
        reason: `No se trabaja directamente sobre ${baseBranch}. Crear una rama con "node tools/nuvio/cli.mjs branch".`
      };
    }
  }
  return { blocked: false };
}

export function evaluateToolCall(payload, context) {
  const toolName = payload?.tool_name ?? '';
  if (/^mcp__/.test(toolName) && MCP_MERGE_TOOL.test(toolName)) {
    return {
      blocked: true,
      rule: 'mcp-merge',
      reason: 'El merge de Pull Requests es exclusivamente manual.'
    };
  }
  if (toolName === 'exec') {
    const command = payload?.tool_input?.command ?? '';
    const needsBranch = /\bgit\s+(?:commit|merge|rebase|cherry-pick)\b/.test(command);
    return evaluateCommand(command, {
      ...context,
      currentBranch: needsBranch ? context.resolveBranch?.() : undefined
    });
  }
  return { blocked: false };
}
