import { ActivityLogger } from './logger.js';
import { LogRotator } from './rotator.js';
import { loadConfig, getTimestamp } from './config.js';
import {
  serializeToolEvent,
  serializeSystemEvent,
  serializeSessionStart,
  serializeSessionEnd,
  serializeError,
} from './serializers.js';
import type { ToolEvent, LoggerConfig } from './types.js';

export default async function AgentLogger({ client }: { client: any }): Promise<any> {
  let config: LoggerConfig | null = null;
  let logger: ActivityLogger | null = null;
  let rotator: LogRotator | null = null;
  let sessionId: string | undefined;
  let sessionName: string | undefined;

  try {
    config = loadConfig();
    sessionId = client?.session?.id;
    sessionName = client?.session?.name || client?.project?.name;
    
    logger = new ActivityLogger(config, sessionName);
    rotator = new LogRotator(config);

    logger.log(serializeSessionStart(client, config));
  } catch (error) {
    console.error('[AgentLogger] Failed to initialize:', error);
    return {};
  }

  const hooks = {
    event: async (input: { type: string; data?: any }) => {
      if (!logger || !config) return;
      try {
        if (config.excludedEvents.includes(input.type)) {
          return;
        }

        const entry = serializeSystemEvent(input.type, input.data, config, sessionId);

        if (entry) {
          logger.log(entry);
        }

        if (Math.random() < 0.01 && rotator) {
          const newPath = rotator.checkRotation(logger.currentPath);
          if (newPath) {
            logger.rotate(newPath);
          }
        }
      } catch (error) {
        console.error('[AgentLogger] Event hook error:', error);
      }
    },

    'tool.execute.before': async (input: { tool: string; args: any }) => {
      if (!logger || !config) return;
      try {
        const toolEvent: ToolEvent = {
          tool: input.tool,
          args: input.args,
          sessionId,
        };

        const entry = serializeToolEvent(toolEvent, 'before', config);

        if (entry) {
          logger.log(entry);
        }
      } catch (error) {
        console.error('[AgentLogger] Tool before hook error:', error);
      }
    },

    'tool.execute.after': async (
      input: { tool: string; args: any },
      output: { duration: number; result?: any }
    ) => {
      if (!logger || !config || !rotator) return;
      try {
        const toolEvent: ToolEvent = {
          tool: input.tool,
          args: input.args,
          sessionId,
          duration: output.duration,
          result: output.result,
        };

        const entry = serializeToolEvent(toolEvent, 'after', config);

        if (entry) {
          logger.log(entry);
        }

        const newPath = rotator.checkRotation(logger.currentPath);
        if (newPath) {
          logger.rotate(newPath);
        }
      } catch (error) {
        console.error('[AgentLogger] Tool after hook error:', error);
      }
    },

    'client.init': async () => {
      if (!logger || !config) return;
      try {
        logger.log({
          timestamp: getTimestamp(config),
          level: 'info',
          type: 'system',
          session_id: sessionId,
          data: {
            event: 'client_initialized',
            model: client?.model?.name,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error('[AgentLogger] Client init hook error:', error);
      }
    },

    close: async () => {
      if (!logger || !config || !rotator) return;
      try {
        logger.log(serializeSessionEnd(client, config));
        await logger.close();
        rotator.cleanup();
      } catch (error) {
        console.error('[AgentLogger] Close hook error:', error);
      }
    },

    'hook.error': async (error: Error, hookName: string) => {
      if (!logger || !config) return;
      try {
        const entry = serializeError(error, `hook:${hookName}`, config, sessionId);
        logger.log(entry);
      } catch (e) {
        console.error('[AgentLogger] Failed to log hook error:', e);
      }
    },
  };

  return hooks;
}
