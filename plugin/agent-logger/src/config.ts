import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { LoggerConfig, LogLevel } from './types.js';

const DEFAULT_CONFIG: LoggerConfig = {
  logDir: '.opencode/logs',
  filenamePattern: 'agent-{YYYY-MM-DD}.ndjson',
  rotation: {
    enabled: true,
    maxSizeMB: 100,
    maxFiles: 10,
    maxAgeDays: 30,
  },
  verbosity: 'info',
  excludedEvents: ['token_usage', 'heartbeat'],
  timestampFormat: 'ISO',
  includeSessionContext: true,
  buffering: {
    enabled: true,
    flushIntervalMs: 100,
    highWatermarkBytes: 16384,
  },
};

export function loadConfig(): LoggerConfig {
  let config: LoggerConfig = { ...DEFAULT_CONFIG };

  const opencodeConfigPath = getOpenCodeConfigPath();
  if (existsSync(opencodeConfigPath)) {
    try {
      const opencodeConfig = JSON.parse(readFileSync(opencodeConfigPath, 'utf8'));
      if (opencodeConfig['agent-logger']) {
        config = mergeConfig(config, opencodeConfig['agent-logger']);
      }
    } catch (error) {
      console.error('[AgentLogger] Failed to parse OpenCode config:', error);
    }
  }

  config = applyEnvironmentOverrides(config);
  config = validateConfig(config);

  return config;
}

function getOpenCodeConfigPath(): string {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(configHome, 'opencode', 'opencode.json');
}

function mergeConfig(base: LoggerConfig, override: Partial<LoggerConfig>): LoggerConfig {
  return {
    ...base,
    ...override,
    rotation: {
      ...base.rotation,
      ...override.rotation,
    },
    buffering: {
      ...base.buffering,
      ...override.buffering,
    },
  };
}

function applyEnvironmentOverrides(config: LoggerConfig): LoggerConfig {
  if (process.env.AGENT_LOGGER_LOG_DIR) {
    config.logDir = process.env.AGENT_LOGGER_LOG_DIR;
  }
  if (process.env.AGENT_LOGGER_VERBOSITY) {
    config.verbosity = process.env.AGENT_LOGGER_VERBOSITY as LogLevel;
  }
  if (process.env.AGENT_LOGGER_EXCLUDED_EVENTS) {
    config.excludedEvents = process.env.AGENT_LOGGER_EXCLUDED_EVENTS.split(',');
  }
  if (process.env.AGENT_LOGGER_TIMESTAMP_FORMAT) {
    config.timestampFormat = process.env.AGENT_LOGGER_TIMESTAMP_FORMAT as any;
  }
  if (process.env.AGENT_LOGGER_ROTATION_ENABLED) {
    config.rotation.enabled = process.env.AGENT_LOGGER_ROTATION_ENABLED === 'true';
  }
  if (process.env.AGENT_LOGGER_ROTATION_MAX_SIZE_MB) {
    config.rotation.maxSizeMB = parseInt(process.env.AGENT_LOGGER_ROTATION_MAX_SIZE_MB, 10);
  }
  if (process.env.AGENT_LOGGER_BUFFERING_ENABLED) {
    config.buffering.enabled = process.env.AGENT_LOGGER_BUFFERING_ENABLED === 'true';
  }

  return config;
}

function validateConfig(config: LoggerConfig): LoggerConfig {
  if (!config.logDir.startsWith('/') && !config.logDir.startsWith('.')) {
    config.logDir = `.opencode/logs`;
  }

  if (config.rotation.maxSizeMB < 1) config.rotation.maxSizeMB = 1;
  if (config.rotation.maxFiles < 1) config.rotation.maxFiles = 1;
  if (config.rotation.maxAgeDays < 1) config.rotation.maxAgeDays = 1;
  if (config.buffering.flushIntervalMs < 10) config.buffering.flushIntervalMs = 10;
  if (config.buffering.highWatermarkBytes < 1024) config.buffering.highWatermarkBytes = 1024;

  const validLevels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  if (!validLevels.includes(config.verbosity)) {
    config.verbosity = 'info';
  }

  return config;
}

export function getTimestamp(config: LoggerConfig): number | string {
  const now = new Date();

  switch (config.timestampFormat) {
    case 'epoch':
      return now.getTime();
    case 'local':
      return now.toLocaleString();
    case 'ISO':
    default:
      return now.toISOString();
  }
}

export function shouldLogLevel(config: LoggerConfig, level: LogLevel): boolean {
  const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  const configIndex = levels.indexOf(config.verbosity);
  const levelIndex = levels.indexOf(level);

  return levelIndex >= configIndex;
}
