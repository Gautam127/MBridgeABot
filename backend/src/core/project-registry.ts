import fs from 'node:fs';
import path from 'node:path';
import {
  type ProjectConfig,
  parseProjectsYaml,
} from '../config/projects.schema.js';

export function resolveProjectsConfigPath(customPath?: string): string {
  if (customPath) {
    return path.resolve(customPath);
  }

  if (process.env.PROJECTS_CONFIG_PATH) {
    return path.resolve(process.env.PROJECTS_CONFIG_PATH);
  }

  const candidatePaths = [
    path.resolve(process.cwd(), 'config', 'projects.yaml'),
    path.resolve(process.cwd(), 'projects.yaml'),
    path.resolve(process.cwd(), '..', 'config', 'projects.yaml'),
    path.resolve(process.cwd(), 'backend', 'config', 'projects.yaml'),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.resolve(process.cwd(), 'config', 'projects.yaml');
}

export function loadProjectsConfig(configPath?: string): ProjectConfig[] {
  const resolvedPath = resolveProjectsConfigPath(configPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Projects configuration file not found at: ${resolvedPath}`);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  return parseProjectsYaml(content);
}

export class ProjectRegistry {
  private projects = new Map<string, ProjectConfig>();

  constructor(initialProjects?: ProjectConfig[]) {
    if (initialProjects) {
      this.registerAll(initialProjects);
    }
  }

  public register(project: ProjectConfig): void {
    const normalizedAlias = project.alias.toLowerCase();
    if (this.projects.has(normalizedAlias)) {
      throw new Error(
        `Duplicate project alias detected: "${normalizedAlias}". Project aliases must be unique.`
      );
    }
    this.projects.set(normalizedAlias, {
      ...project,
      alias: normalizedAlias,
    });
  }

  public registerAll(projects: ProjectConfig[]): void {
    for (const project of projects) {
      this.register(project);
    }
  }

  public getProject(alias?: string | null): ProjectConfig | undefined {
    if (!alias || typeof alias !== 'string') {
      return undefined;
    }
    return this.projects.get(alias.trim().toLowerCase());
  }

  public hasProject(alias?: string | null): boolean {
    if (!alias || typeof alias !== 'string') {
      return false;
    }
    return this.projects.has(alias.trim().toLowerCase());
  }

  public getAllProjects(): ProjectConfig[] {
    return Array.from(this.projects.values());
  }

  public getProjectAliases(): string[] {
    return Array.from(this.projects.keys());
  }

  public getProjectCount(): number {
    return this.projects.size;
  }

  public clear(): void {
    this.projects.clear();
  }

  private buildAtomicProjectsMap(projects: ProjectConfig[]): Map<string, ProjectConfig> {
    const newMap = new Map<string, ProjectConfig>();
    for (const project of projects) {
      const normalizedAlias = project.alias.trim().toLowerCase();
      if (newMap.has(normalizedAlias)) {
        throw new Error(
          `Duplicate project alias detected: "${normalizedAlias}". Project aliases must be unique.`
        );
      }
      newMap.set(normalizedAlias, {
        ...project,
        alias: normalizedAlias,
      });
    }
    return newMap;
  }

  public loadFromFile(configPath?: string): void {
    const loaded = loadProjectsConfig(configPath);
    this.projects = this.buildAtomicProjectsMap(loaded);
  }

  public loadFromYaml(yamlContent: string): void {
    const loaded = parseProjectsYaml(yamlContent);
    this.projects = this.buildAtomicProjectsMap(loaded);
  }
}

export const defaultProjectRegistry = new ProjectRegistry();

export function getProjectRegistry(): ProjectRegistry {
  return defaultProjectRegistry;
}
