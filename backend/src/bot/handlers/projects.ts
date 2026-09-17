import type { Context } from 'grammy';
import {
  type ProjectRegistry,
  defaultProjectRegistry,
} from '../../core/project-registry.js';
import type { ProjectConfig } from '../../config/projects.schema.js';
import { escapeMarkdownV1 } from '../../core/telemetry.js';

export function formatProjectsMessage(projects: ProjectConfig[]): string {
  if (projects.length === 0) {
    return [
      '📁 *Mounted Projects Registry (0)*',
      '',
      '_No workstation projects are currently configured._',
    ].join('\n');
  }

  const lines: string[] = [
    `📁 *Mounted Projects Registry (${projects.length})*`,
    '',
  ];

  for (const project of projects) {
    const safeAlias = escapeMarkdownV1(project.alias);
    const safeProvider = escapeMarkdownV1(project.agentProvider);
    lines.push(`• *${safeAlias}*`);
    lines.push(`  Path: \`${project.path}\``);
    lines.push(`  Provider: \`${safeProvider}\``);
    lines.push('');
  }

  const sampleAlias = projects[0]?.alias ? escapeMarkdownV1(projects[0].alias) : '<alias>';
  lines.push(`👉 _Next:_ /build ${sampleAlias} or /test ${sampleAlias}`);

  return lines.join('\n');
}

export function createProjectsHandler(registry?: ProjectRegistry) {
  return async (ctx: Context): Promise<void> => {
    const reg = registry ?? defaultProjectRegistry;
    const projects = reg.getAllProjects();
    const message = formatProjectsMessage(projects);
    await ctx.reply(message, { parse_mode: 'Markdown' });
  };
}
