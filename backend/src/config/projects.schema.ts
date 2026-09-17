import { z } from 'zod';
import YAML from 'yaml';

export const projectEntrySchema = z
  .object({
    alias: z
      .string({ error: 'alias is required' })
      .trim()
      .min(1, 'alias must not be empty')
      .transform((val) => val.toLowerCase()),
    path: z
      .string({ error: 'path is required' })
      .min(1, 'path must not be empty'),
    buildCmd: z
      .string({ error: 'buildCmd is required' })
      .min(1, 'buildCmd must not be empty'),
    testCmd: z
      .string({ error: 'testCmd is required' })
      .min(1, 'testCmd must not be empty'),
    agentProvider: z
      .string({ error: 'agentProvider is required' })
      .min(1, 'agentProvider must not be empty'),
    timeoutSeconds: z.number().positive().optional(),
    testScreenshotsDir: z.string().optional(),
  })
  .passthrough();

export type ProjectConfig = z.infer<typeof projectEntrySchema>;

export const projectsConfigSchema = z.preprocess((val) => {
  if (!val || typeof val !== 'object') {
    return val;
  }
  // Array at top level
  if (Array.isArray(val)) {
    return { projects: val };
  }
  const obj = val as Record<string, unknown>;
  // If already an array under { projects: [...] }
  if (Array.isArray(obj.projects)) {
    return obj;
  }
  // If a dictionary under { projects: { alias1: { ... }, alias2: { ... } } }
  if (obj.projects && typeof obj.projects === 'object' && !Array.isArray(obj.projects)) {
    const record = obj.projects as Record<string, Record<string, unknown>>;
    const projectsArray = Object.entries(record).map(([key, entry]) => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        return {
          alias: entry.alias ?? key,
          ...entry,
        };
      }
      return entry;
    });
    return { projects: projectsArray };
  }
  return obj;
}, z.object({
  projects: z.array(projectEntrySchema, {
    error: 'projects configuration is required',
  }),
}));

export type ProjectsConfigFile = z.infer<typeof projectsConfigSchema>;

export function validateProjectsConfig(data: unknown): ProjectConfig[] {
  const result = projectsConfigSchema.safeParse(data);
  if (!result.success) {
    const errorMessages = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || 'projects'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Projects configuration validation failed:\n${errorMessages}`);
  }
  return result.data.projects;
}

export function parseProjectsYaml(yamlContent: string): ProjectConfig[] {
  if (!yamlContent || !yamlContent.trim()) {
    throw new Error('Projects configuration is empty. projects.yaml must contain valid configuration.');
  }

  let parsed: unknown;
  try {
    parsed = YAML.parse(yamlContent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse projects YAML: ${message}`);
  }

  return validateProjectsConfig(parsed);
}
