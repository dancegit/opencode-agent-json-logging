import { createWriteStream, WriteStream, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { LoggerConfig, LogEntry } from './types.js';
import { getTimestamp, shouldLogLevel } from './config.js';

export class ActivityLogger {
  private stream: WriteStream | null = null;
  private buffer: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private currentLogPath: string = '';
  private isClosing: boolean = false;
  private writeQueue: Promise<void> = Promise.resolve();
  private sessionName: string | undefined;

  constructor(private config: LoggerConfig, sessionName?: string) {
    this.sessionName = sessionName;
    this.ensureLogDirectory();
    this.initializeStream();
    this.setupPeriodicFlush();
    this.setupGracefulShutdown();
  }

  get currentPath(): string {
    return this.currentLogPath;
  }

  private ensureLogDirectory(): void {
    const logDir = this.config.logDir;
    if (!existsSync(logDir)) {
      try {
        mkdirSync(logDir, { recursive: true });
      } catch (error) {
        console.error('[AgentLogger] Failed to create log directory:', error);
        this.config.logDir = '.opencode/logs';
        if (!existsSync(this.config.logDir)) {
          mkdirSync(this.config.logDir, { recursive: true });
        }
      }
    }
  }

  private initializeStream(): void {
    this.currentLogPath = this.generateLogPath();

    try {
      this.stream = createWriteStream(this.currentLogPath, {
        flags: 'a',
        highWaterMark: this.config.buffering.highWatermarkBytes,
      });

      this.stream.on('error', (error) => {
        console.error('[AgentLogger] Stream error:', error);
      });

      this.stream.on('drain', () => {
      });
    } catch (error) {
      console.error('[AgentLogger] Failed to create write stream:', error);
    }
  }

  private generateLogPath(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    let filename = this.config.filenamePattern;
    filename = filename.replace(/{YYYY}/g, String(year));
    filename = filename.replace(/{MM}/g, month);
    filename = filename.replace(/{DD}/g, day);
    filename = filename.replace(/{HH}/g, hours);
    filename = filename.replace(/{mm}/g, minutes);
    filename = filename.replace(/{ss}/g, seconds);
    filename = filename.replace(/{YYYY-MM-DD}/g, `${year}-${month}-${day}`);
    
    if (this.sessionName) {
      const sanitizedSession = this.sessionName
        .replace(/[^a-zA-Z0-9-_]/g, '_')
        .substring(0, 50);
      filename = filename.replace(/{session}/g, sanitizedSession);
    } else {
      filename = filename.replace(/{session}/g, 'unknown');
    }

    return join(this.config.logDir, filename);
  }

  private setupPeriodicFlush(): void {
    if (this.config.buffering.enabled && this.config.buffering.flushIntervalMs > 0) {
      this.flushTimer = setInterval(() => {
        this.flush();
      }, this.config.buffering.flushIntervalMs);

      if (this.flushTimer.unref) {
        this.flushTimer.unref();
      }
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = () => {
      this.close().catch(() => {
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('exit', () => {
      this.syncFlush();
    });
  }

  log(entry: LogEntry): void {
    if (this.isClosing) {
      return;
    }

    if (!shouldLogLevel(this.config, entry.level)) {
      return;
    }

    if (!entry.timestamp) {
      entry.timestamp = getTimestamp(this.config);
    }

    const line = JSON.stringify(entry) + '\n';

    if (this.config.buffering.enabled) {
      this.buffer.push(line);

      const bufferSize = this.buffer.reduce((acc, line) => acc + line.length, 0);
      if (bufferSize > this.config.buffering.highWatermarkBytes) {
        this.flush();
      }
    } else {
      this.writeImmediately(line);
    }
  }

  private writeImmediately(line: string): void {
    if (!this.stream) {
      console.error('[AgentLogger] Stream not initialized');
      return;
    }

    const canContinue = this.stream.write(line);

    if (!canContinue) {
    }
  }

  flush(): void {
    if (this.buffer.length === 0 || !this.stream) {
      return;
    }

    const linesToWrite = this.buffer.join('');
    this.buffer = [];

    this.writeQueue = this.writeQueue.then(() => {
      return new Promise<void>((resolve) => {
        if (!this.stream) {
          resolve();
          return;
        }

        const canContinue = this.stream.write(linesToWrite, () => {
          resolve();
        });

        if (!canContinue) {
          this.stream.once('drain', () => {
            resolve();
          });
        }
      });
    });
  }

  private syncFlush(): void {
    if (this.buffer.length === 0 || !this.stream) {
      return;
    }

    try {
      const linesToWrite = this.buffer.join('');
      this.buffer = [];

      const fs = require('fs');
      fs.appendFileSync(this.currentLogPath, linesToWrite);
    } catch (error) {
      console.error('[AgentLogger] Sync flush failed:', error);
    }
  }

  async close(): Promise<void> {
    if (this.isClosing) {
      return;
    }

    this.isClosing = true;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
    await this.writeQueue;

    if (this.stream) {
      return new Promise((resolve) => {
        this.stream!.end(() => {
          this.stream = null;
          resolve();
        });
      });
    }
  }

  rotate(newPath: string): void {
    this.flush();

    if (this.stream) {
      this.stream.end();
    }

    this.currentLogPath = newPath;
    this.initializeStream();

    this.log({
      timestamp: getTimestamp(this.config),
      level: 'info',
      type: 'system',
      data: {
        event: 'log_rotated',
        newPath,
      },
    });
  }
}
