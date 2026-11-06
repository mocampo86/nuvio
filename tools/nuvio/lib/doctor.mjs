import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { readJson, readText } from './core.mjs';

export const REQUIRED_SKILL_SECTIONS = [
  '## Responsabilidad',
  '## Activación',
  '## Entradas',
  '## Procedimiento',
  '## Salidas',
  '## Restricciones',
  '## Criterios de finalización'
];

export const REQUIRED_SKILLS = [
  'nuvio-requirements',
  'nuvio-architecture',
  'nuvio-clean-code',
  'nuvio-design-patterns',
  'nuvio-implementation',
  'nuvio-testing',
  'nuvio-security',
  'nuvio-review',
  'nuvio-reporting',
  'nuvio-github',
  'nuvio-us',
  'nuvio-fix',
  'nuvio-status',
  'nuvio-resume',
  'nuvio-pr'
];

export function parseFrontmatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(content);
  if (!match) return null;
  const data = {};
  let listKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.+)$/.exec(line);
    if (item && listKey) {
      data[listKey].push(item[1].trim());
      continue;
    }
    const pair = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const [, key, value] = pair;
    if (value === '') {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = value.replace(/^["']|["']$/g, '');
      listKey = null;
    }
  }
  return { data, body: match[2] };
}

export function validateSkill({ dirName, content, knownSkills, knownAgents, knownCommands }) {
  const errors = [];
  const parsed = parseFrontmatter(content);
  if (!parsed) return [`${dirName}: falta frontmatter YAML válido.`];
  const { data, body } = parsed;
  if (data.name !== dirName)
    errors.push(`${dirName}: "name" (${data.name}) debe coincidir con el directorio.`);
  if (!data.description || data.description.length < 20)
    errors.push(`${dirName}: "description" ausente o demasiado corta.`);
  if (data.triggers && !data.triggers.every((t) => ['user', 'model'].includes(t))) {
    errors.push(`${dirName}: triggers inválidos (${data.triggers.join(', ')}).`);
  }
  if (data.agent && !knownAgents.includes(data.agent))
    errors.push(`${dirName}: agente "${data.agent}" inexistente.`);
  for (const section of REQUIRED_SKILL_SECTIONS) {
    if (!body.includes(section)) errors.push(`${dirName}: falta la sección "${section}".`);
  }
  for (const [, skill] of body.matchAll(/(?:^|[\s`(])\/(nuvio-[a-z-]+)/g)) {
    if (!knownSkills.includes(skill))
      errors.push(`${dirName}: referencia a /${skill} inexistente.`);
  }
  for (const [, command] of body.matchAll(/cli\.mjs\s+([a-z][a-z-]*)/g)) {
    if (!knownCommands.includes(command))
      errors.push(`${dirName}: comando "cli.mjs ${command}" inexistente.`);
  }
  return errors;
}

function listDirs(dir) {
  return existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];
}

export function runDoctor(root, knownCommands) {
  const errors = [];
  const skillsDir = path.join(root, '.devin', 'skills');
  const agentsDir = path.join(root, '.devin', 'agents');
  const skills = listDirs(skillsDir);
  const agents = existsSync(agentsDir)
    ? readdirSync(agentsDir)
        .filter((file) => file.endsWith('.md'))
        .map((file) => file.replace(/\.md$/, ''))
    : [];

  for (const required of REQUIRED_SKILLS) {
    if (!skills.includes(required)) errors.push(`Falta la skill ${required}.`);
  }
  for (const dirName of skills) {
    const file = path.join(skillsDir, dirName, 'SKILL.md');
    if (!existsSync(file)) {
      errors.push(`${dirName}: falta SKILL.md.`);
      continue;
    }
    errors.push(
      ...validateSkill({
        dirName,
        content: readText(file),
        knownSkills: skills,
        knownAgents: agents,
        knownCommands
      })
    );
  }
  for (const agent of agents) {
    const parsed = parseFrontmatter(readText(path.join(agentsDir, `${agent}.md`)));
    if (!parsed?.data.description)
      errors.push(`Agente ${agent}: falta frontmatter con description.`);
  }

  for (const jsonFile of [
    '.devin/config.json',
    '.devin/hooks.v1.json',
    'tools/nuvio/config.json'
  ]) {
    try {
      readJson(path.join(root, jsonFile));
    } catch (error) {
      errors.push(`${jsonFile}: ${error.message}`);
    }
  }
  const hooks = readJson(path.join(root, '.devin', 'hooks.v1.json'), {});
  for (const entries of Object.values(hooks)) {
    for (const hook of entries.flatMap((entry) => entry.hooks ?? [])) {
      const script = /node\s+(\S+\.mjs)/.exec(hook.command ?? '')?.[1];
      if (script && !existsSync(path.join(root, script)))
        errors.push(`Hook apunta a un script inexistente: ${script}.`);
    }
  }
  return { errors, skills, agents };
}
