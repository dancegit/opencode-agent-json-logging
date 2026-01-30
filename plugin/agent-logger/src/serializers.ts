import type { ToolEvent, LogEntry, LogLevel, LoggerConfig } from './types.js';
import { getTimestamp, shouldLogLevel } from './config.js';

const SENSITIVE_FIELDS = ['password', 'token', 'secret', 'key', 'api_key', 'auth', 'credential'];

export function serializeToolEvent(
  event: ToolEvent,
  direction: 'before' | 'after',
  config: LoggerConfig
): LogEntry | null {
  const level: LogLevel = direction === 'after' && event.result?.error ? 'error' : 'info';

  if (!shouldLogLevel(config, level)) {
    return null;
  }

  return {
    timestamp: getTimestamp(config),
    level,
    type: 'tool_use',
    session_id: event.sessionId,
    data: {
      tool: event.tool,
      direction,
      duration_ms: direction === 'after' ? event.duration : undefined,
      input: direction === 'before' ? sanitizeArgs(event.args) : undefined,
      output: direction === 'after' ? truncateOutput(event.result) : undefined,
      status: direction === 'after' ? (event.result?.error ? 'error' : 'success') : 'pending',
    },
  };
}

export function serializeSystemEvent(
  eventType: string,
  payload: any,
  config: LoggerConfig,
  sessionId?: string
): LogEntry | null {
  if (config.excludedEvents.includes(eventType)) {
    return null;
  }

  if (!shouldLogLevel(config, 'debug')) {
    return null;
  }

  return {
    timestamp: getTimestamp(config),
    level: 'debug',
    type: 'system',
    session_id: sessionId,
    data: {
      eventType,
      payload: sanitizeArgs(payload),
    },
  };
}

export function serializeSessionStart(
  client: any,
  config: LoggerConfig
): LogEntry {
  return {
    timestamp: getTimestamp(config),
    level: 'info',
    type: 'system',
    session_id: client?.session?.id,
    data: {
      event: 'session_start',
      model: client?.model?.name,
      cwd: process.cwd(),
      args: process.argv,
      node_version: process.version,
      platform: process.platform,
    },
  };
}

export function serializeSessionEnd(
  client: any,
  config: LoggerConfig,
  exitCode?: number
): LogEntry {
  return {
    timestamp: getTimestamp(config),
    level: 'info',
    type: 'system',
    session_id: client?.session?.id,
    data: {
      event: 'session_end',
      exit_code: exitCode,
      uptime_seconds: process.uptime(),
    },
  };
}

export function serializeLLMEvent(
  event: any,
  config: LoggerConfig,
  sessionId?: string
): LogEntry | null {
  if (config.excludedEvents.includes('llm') || config.excludedEvents.includes('completion')) {
    return null;
  }

  return {
    timestamp: getTimestamp(config),
    level: 'info',
    type: 'llm',
    session_id: sessionId,
    data: {
      event_type: event.type,
      model: event.model,
      tokens: event.tokens,
      latency_ms: event.latency,
    },
  };
}

export function serializeError(
  error: Error,
  context: string,
  config: LoggerConfig,
  sessionId?: string
): LogEntry {
  return {
    timestamp: getTimestamp(config),
    level: 'error',
    type: 'error',
    session_id: sessionId,
    data: {
      context,
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack,
    },
  };
}

export function sanitizeArgs(args: any): any {
  if (!args || typeof args !== 'object') {
    return args;
  }

  if (Array.isArray(args)) {
    return args.map(sanitizeArgs);
  }

  const sanitized: any = {};
  for (const [key, value] of Object.entries(args)) {
    const isSensitive = SENSITIVE_FIELDS.some((field) =>
      key.toLowerCase().includes(field.toLowerCase())
    );

    if (isSensitive) {
      sanitized[key] = '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeArgs(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export function truncateOutput(result: any, maxLength: number = 10000): any {
  if (!result || typeof result !== 'object') {
    return result;
  }

  if (typeof result.output === 'string' && result.output.length > maxLength) {
    return {
      ...result,
      output: result.output.substring(0, maxLength) + `... [truncated ${result.output.length - maxLength} chars]`,
      truncated: true,
      original_length: result.output.length,
    };
  }

  const resultStr = JSON.stringify(result);
  if (resultStr.length > maxLength * 2) {
    return {
      _truncated: true,
      _original_size: resultStr.length,
      _summary: 'Output was too large and was truncated',
      preview: resultStr.substring(0, maxLength) + '...',
    };
  }

  return result;
}
