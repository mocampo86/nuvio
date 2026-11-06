import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REQUIRED_SKILL_SECTIONS, parseFrontmatter, validateSkill } from '../lib/doctor.mjs';

const body = REQUIRED_SKILL_SECTIONS.join('\n\ntext\n\n');
const skill = (frontmatter, extra = '') =>
  `---\n${frontmatter}\n---\n\n# Skill\n\n${body}\n${extra}`;
const validate = (content) =>
  validateSkill({
    dirName: 'nuvio-demo',
    content,
    knownSkills: ['nuvio-demo', 'nuvio-us'],
    knownAgents: ['nuvio-reviewer'],
    knownCommands: ['status', 'init']
  });

describe('skill validation', () => {
  const valid =
    'name: nuvio-demo\ndescription: A demo skill used to validate the checker.\ntriggers:\n  - user';

  it('parses frontmatter with scalar and list values', () => {
    const { data } = parseFrontmatter(skill(valid));
    assert.equal(data.name, 'nuvio-demo');
    assert.deepEqual(data.triggers, ['user']);
  });

  it('accepts a complete skill', () => {
    assert.deepEqual(
      validate(skill(valid, 'Run `node tools/nuvio/cli.mjs status` then /nuvio-us.')),
      []
    );
  });

  it('reports wrong names, missing sections, unknown agents, skills and commands', () => {
    const errors = validate(
      `---\nname: other\ndescription: short\nagent: ghost\n---\n## Responsabilidad\nUse /nuvio-ghost and cli.mjs deploy`
    );
    for (const expected of [
      'coincidir',
      'description',
      'ghost',
      'Procedimiento',
      '/nuvio-ghost',
      'deploy'
    ]) {
      assert.ok(
        errors.some((e) => e.includes(expected)),
        `missing error about ${expected}: ${errors.join(' | ')}`
      );
    }
  });

  it('rejects files without frontmatter', () => {
    assert.equal(validate('# no frontmatter').length, 1);
  });
});
