import { createSkillConfigSchema, type AgentConfig, type CreateSkillConfig } from '@evals/shared';
import { slugify } from './experiment-form';

export type SkillMode = 'new' | 'existing';

export interface SkillConfigForm {
  baseConfigId: string;
  mode: SkillMode;
  existingSkill: string;
  skillName: string;
  description: string;
  instructions: string;
  id: string;
  name: string;
}

export type SkillConfigErrors = Partial<Record<keyof SkillConfigForm, string>>;

export const emptySkillConfigForm = (): SkillConfigForm => ({
  baseConfigId: 'base',
  mode: 'new',
  existingSkill: '',
  skillName: '',
  description: '',
  instructions: '',
  id: '',
  name: '',
});

/** A starting point for a SKILL.md body: what the skill is for, the rules, one example. */
export const SKILL_TEMPLATE = `# <Skill title>

Use this skill when <the kind of task it is for>.

## Rules

1. <A concrete rule Hermes must follow.>
2. <Another rule. Be specific: names, formats, order, what to leave out.>

## Procedure

1. <First step.>
2. <Next step.>

## Example

Input:

\`\`\`
<a small input>
\`\`\`

Output:

\`\`\`
<exactly what the output should look like>
\`\`\`
`;

export const skillOf = (form: SkillConfigForm): string =>
  form.mode === 'new' ? form.skillName : form.existingSkill;

/** Suggested id and display name, e.g. `base-csv-tidy` and `Base · Sonnet 5 + csv-tidy`. */
export function suggestedIdentity(
  form: SkillConfigForm,
  base: AgentConfig | undefined,
): { id: string; name: string } {
  const skill = skillOf(form);
  if (!base || !skill) return { id: '', name: '' };
  return { id: slugify(`${base.id}-${skill}`), name: `${base.name} + ${skill}` };
}

export function toSkillConfigRequest(form: SkillConfigForm): CreateSkillConfig {
  return {
    id: form.id,
    name: form.name.trim(),
    baseConfigId: form.baseConfigId,
    skill:
      form.mode === 'new'
        ? {
            kind: 'new',
            name: form.skillName,
            description: form.description.trim(),
            instructions: form.instructions,
          }
        : { kind: 'existing', name: form.existingSkill },
  };
}

const FIELD: Record<string, keyof SkillConfigForm> = {
  id: 'id',
  name: 'name',
  baseConfigId: 'baseConfigId',
};
const SKILL_FIELD: Record<string, keyof SkillConfigForm> = {
  name: 'skillName',
  description: 'description',
  instructions: 'instructions',
};

/** The server's schema, client-side, plus the checks that need the loaded configs. */
export function validateSkillConfig(
  form: SkillConfigForm,
  base: AgentConfig | undefined,
  takenConfigIds: ReadonlySet<string>,
): SkillConfigErrors {
  const errors: SkillConfigErrors = {};
  const parsed = createSkillConfigSchema.safeParse(toSkillConfigRequest(form));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const [top, sub] = issue.path.map(String);
      const field =
        top === 'skill'
          ? form.mode === 'new'
            ? (SKILL_FIELD[sub ?? ''] ?? 'skillName')
            : 'existingSkill'
          : (FIELD[top ?? ''] ?? 'name');
      errors[field] ??= issue.message;
    }
  }
  if (form.mode === 'existing' && !form.existingSkill) errors.existingSkill = 'Pick a skill';
  if (form.mode === 'new' && !form.skillName) errors.skillName = 'Name the skill';
  if (!base) errors.baseConfigId = 'Pick a base config';
  else if (base.skills.includes(skillOf(form))) {
    errors[form.mode === 'new' ? 'skillName' : 'existingSkill'] =
      `${base.id} already has this skill`;
  }
  if (takenConfigIds.has(form.id)) errors.id = `Config ${form.id} already exists`;
  return errors;
}
