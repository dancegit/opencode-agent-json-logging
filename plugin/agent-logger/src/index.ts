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
import type { ToolEvent } from './types.js';

interface Plugin {
  event?: (input: { type: string; data?: any }) => Promise<void>;
  'tool.execute.before'?: (input: { tool: string; args: any }) => Promise<void>;
  'tool.execute.after'?: (
    input: { tool: string; args: any },
    output: { duration: number; result?: any }
  ) => Promise<void>;
  'client.init'?: () => Promise<void>;
  close?: () => Promise<void>;
  'hook.error'?: (error: Error, hookName: string) => Promise<void>;
}

export default async function AgentLogger({ client }: { client: any }): Promise<Plugin> {
  const config = loadConfig();
  const logger = new ActivityLogger(config);
  const rotator = new LogRotator(config);

  logger.log(serializeSessionStart(client, config));

  const sessionId = client?.session?.id;

  return {
    event: async (input: { type: string; data?: any }) => {
      try {
        if (config.excludedEvents.includes(input.type)) {
          return;
        }

        const entry = serializeSystemEvent(input.type, input.data, config, sessionId);

        if (entry) {
          logger.log(entry);
        }

        if (Math.random() < 0.01) {
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
      try {
        logger.log(serializeSessionEnd(client, config));
        await logger.close();
        rotator.cleanup();
      } catch (error) {
        console.error('[AgentLogger] Close hook error:', error);
      }
    },

    'hook.error': async (error: Error, hookName: string) => {
      try {
        const entry = serializeError(error, `hook:${hookName}`, config, sessionId);
        logger.log(entry);
      } catch (e) {
        console.error('[AgentLogger] Failed to log hook error:', e);
      }
    },
  };
}
