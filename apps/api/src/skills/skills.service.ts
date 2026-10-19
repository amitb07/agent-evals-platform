import { createHash } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@evals/db';
import {
  agentConfigSchema,
  type AgentConfig,
  type CreateSkillConfig,
  type SkillDetail,
  type SkillSummary,
} from '@evals/shared';
import { API_ENV, type ApiEnv } from '../config';
import { toAgentConfig } from '../common/mappers';
import {
  createCustomSkill,
  getSkill,
  listSkills,
  removeCustomSkill,
  renderSkill,
  SkillExistsError,
  skillRoots,
  type SkillRoots,
} from './skill-files';

/** Marks configs created in the UI; YAML-synced configs store the file's sha256 instead. */
export const UI_HASH_PREFIX = 'ui:';

@Injectable()
export class SkillsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(API_ENV) private readonly env: Pick<ApiEnv, 'REPO_DIR' | 'DATA_DIR'>,
  ) {}

  private get roots(): SkillRoots {
    return skillRoots(this.env.REPO_DIR, this.env.DATA_DIR);
  }

  list(): Promise<SkillSummary[]> {
    return listSkills(this.roots);
  }

  async get(name: string): Promise<SkillDetail> {
    const skill = await getSkill(this.roots, name);
    if (!skill) throw new NotFoundException(`Skill ${name} not found`);
    return skill;
  }

  /**
   * A new config = the base config plus one skill. A new skill is written first and removed again
   * if the config cannot be stored, so a failed request leaves nothing behind.
   */
  async createConfig(body: CreateSkillConfig): Promise<AgentConfig> {
    const base = await this.prisma.agentConfig.findUnique({ where: { slug: body.baseConfigId } });
    if (!base) throw new NotFoundException(`Config ${body.baseConfigId} not found`);
    if (await this.prisma.agentConfig.findUnique({ where: { slug: body.id } })) {
      throw new ConflictException(`Config ${body.id} already exists`);
    }
    const skill = body.skill.name;
    if (base.skills.includes(skill)) {
      throw new ConflictException(`Config ${base.slug} already has skill ${skill}`);
    }

    if (body.skill.kind === 'existing') {
      if (!(await getSkill(this.roots, skill))) {
        throw new NotFoundException(`Skill ${skill} not found`);
      }
    } else {
      try {
        await createCustomSkill(
          this.roots,
          skill,
          renderSkill(skill, body.skill.description, body.skill.instructions),
        );
      } catch (error) {
        if (error instanceof SkillExistsError) throw new ConflictException(error.message);
        throw error;
      }
    }

    const config = agentConfigSchema.parse({
      ...toAgentConfig(base),
      id: body.id,
      name: body.name,
      skills: [...base.skills, skill],
    });
    try {
      await this.prisma.agentConfig.create({
        data: {
          slug: config.id,
          yamlHash:
            UI_HASH_PREFIX + createHash('sha256').update(JSON.stringify(config)).digest('hex'),
          name: config.name,
          hermesImageDigest: config.hermesImageDigest,
          model: config.model,
          provider: config.provider,
          skills: config.skills,
          toolsets: config.toolsets,
          memory: config.memory,
          maxTurns: config.maxTurns,
        },
      });
    } catch (error) {
      if (body.skill.kind === 'new') await removeCustomSkill(this.roots, skill);
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException(`Config ${body.id} already exists`);
      }
      throw error;
    }
    return config;
  }
}
