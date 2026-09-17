import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

export interface SystemTelemetry {
  botUptimeSeconds: number;
  formattedBotUptime: string;
  hostUptimeSeconds: number;
  formattedHostUptime: string;
  platform: string;
  osRelease: string;
  nodeVersion: string;
  freeMemoryBytes: number;
  totalMemoryBytes: number;
  freeMemoryGb: number;
  totalMemoryGb: number;
  mountedProjectsCount: number;
}

export interface TelemetryCollectorOptions {
  botUptime?: number;
  hostUptime?: number;
  platform?: string;
  osRelease?: string;
  nodeVersion?: string;
  freeMemoryBytes?: number;
  totalMemoryBytes?: number;
  projectsConfigPath?: string;
  projectCount?: number;
  getProjectCount?: () => number;
}

export function escapeMarkdownV1(text: string): string {
  return text.replace(/([_*`\[])/g, '\\$1');
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0s';
  }
  const totalSeconds = Math.floor(seconds);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}

export function bytesToGb(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 0;
  }
  const gb = bytes / (1024 * 1024 * 1024);
  return Math.round(gb * 10) / 10;
}

export function countProjectsFromYamlContent(content: string): number {
  const lines = content.split(/\r?\n/);
  let inProjectsSection = false;
  let count = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    if (/^projects\s*:\s*$/.test(trimmed)) {
      inProjectsSection = true;
      continue;
    }

    if (inProjectsSection) {
      // If a non-indented key appears, we've left the projects block
      if (/^[a-zA-Z0-9_-]+\s*:/.test(line)) {
        break;
      }
      // Matches indented project definition (e.g. "  my-project:")
      if (/^\s{2}[a-zA-Z0-9_-]+\s*:\s*$/.test(line)) {
        count++;
      }
    }
  }

  return count;
}

export function getMountedProjectsCount(configPath?: string): number {
  const resolvedPath =
    configPath ?? path.resolve(process.cwd(), 'config', 'projects.yaml');

  try {
    if (!fs.existsSync(resolvedPath)) {
      return 0;
    }
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    return countProjectsFromYamlContent(content);
  } catch {
    return 0;
  }
}

export function getSystemTelemetry(options: TelemetryCollectorOptions = {}): SystemTelemetry {
  const botUptimeSeconds = options.botUptime ?? process.uptime();
  const hostUptimeSeconds = options.hostUptime ?? os.uptime();
  const platform = options.platform ?? process.platform;
  const osRelease = options.osRelease ?? os.release();
  const nodeVersion = options.nodeVersion ?? process.version;
  const freeMemoryBytes = options.freeMemoryBytes ?? os.freemem();
  const totalMemoryBytes = options.totalMemoryBytes ?? os.totalmem();

  let mountedProjectsCount = 0;
  if (options.projectCount !== undefined) {
    mountedProjectsCount = options.projectCount;
  } else if (options.getProjectCount) {
    mountedProjectsCount = options.getProjectCount();
  } else {
    mountedProjectsCount = getMountedProjectsCount(options.projectsConfigPath);
  }

  return {
    botUptimeSeconds,
    formattedBotUptime: formatUptime(botUptimeSeconds),
    hostUptimeSeconds,
    formattedHostUptime: formatUptime(hostUptimeSeconds),
    platform,
    osRelease,
    nodeVersion,
    freeMemoryBytes,
    totalMemoryBytes,
    freeMemoryGb: bytesToGb(freeMemoryBytes),
    totalMemoryGb: bytesToGb(totalMemoryBytes),
    mountedProjectsCount,
  };
}

export function formatTelemetryMessage(telemetry: SystemTelemetry): string {
  const safeBotUptime = escapeMarkdownV1(telemetry.formattedBotUptime);
  const safeHostUptime = escapeMarkdownV1(telemetry.formattedHostUptime);
  const safeNode = escapeMarkdownV1(telemetry.nodeVersion);
  const safePlatform = escapeMarkdownV1(telemetry.platform);
  const safeOs = escapeMarkdownV1(telemetry.osRelease);

  return [
    '🖥️ *MBridgeABot Status — Workstation Online*',
    '',
    `⏱️ *Bot Uptime:* ${safeBotUptime} _(Host: ${safeHostUptime})_`,
    `🧠 *System RAM:* ${telemetry.freeMemoryGb} GB free / ${telemetry.totalMemoryGb} GB total`,
    `⚡ *Node Runtime:* ${safeNode} (${safePlatform} ${safeOs})`,
    `📂 *Mounted Projects:* ${telemetry.mountedProjectsCount}`,
    '',
    '👉 _Next:_ /projects or /ping',
  ].join('\n');
}
