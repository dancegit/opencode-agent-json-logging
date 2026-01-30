/**
 * Type definitions for OpenCode Agent Logger Plugin
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type TimestampFormat = 'ISO' | 'epoch' | 'local';

export interface RotationConfig {
  enabled: boolean;
  maxSizeMB: number;
  maxFiles: number;
  maxAgeDays: number;
}

export interface BufferingConfig {
  enabled: boolean;
  flushIntervalMs: number;
  highWatermarkBytes: number;
}

export interface LoggerConfig {
  logDir: string;
  filenamePattern: string;
  rotation: RotationConfig;
  verbosity: LogLevel;
  excludedEvents: string[];
  timestampFormat: TimestampFormat;
  includeSessionContext: boolean;
  buffering: BufferingConfig;
}

export interface LogEntry {
  timestamp: number | string;
  level: LogLevel;
  type: 'system' | 'tool_use' | 'llm' | 'error';
  session_id?: string;
  data: Record<string, any>;
}

export interface ToolEvent {
  tool: string;
  args: any;
  sessionId?: string;
  duration?: number;
  result?: {
    error?: string;
    output?: any;
  };
}

export interface ClientContext {
  session?: {
    id: string;
  };
  model?: {
    name: string;
  };
}

export interface PluginInput {
  type: string;
  data?: any;
  tool?: string;
  args?: any;
}

export interface PluginOutput {
  duration: number;
  result?: any;
}
