import { statSync, readdirSync, unlinkSync, renameSync, existsSync } from 'fs';
import { join, basename } from 'path';
import type { LoggerConfig } from './types.js';

export class LogRotator {
  private rotationInProgress: boolean = false;

  constructor(private config: LoggerConfig) {}

  checkRotation(currentPath: string): string | null {
    if (!this.config.rotation.enabled || this.rotationInProgress) {
      return null;
    }

    try {
      const stats = statSync(currentPath);
      const sizeMB = stats.size / (1024 * 1024);

      if (sizeMB > this.config.rotation.maxSizeMB) {
        return this.rotate(currentPath);
      }
    } catch (error) {
      return null;
    }

    return null;
  }

  private rotate(currentPath: string): string | null {
    if (this.rotationInProgress) {
      return null;
    }

    this.rotationInProgress = true;

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const archiveFilename = basename(currentPath).replace(
        '.ndjson',
        `-${timestamp}.ndjson`
      );
      const archivePath = join(this.config.logDir, 'archive', archiveFilename);

      const archiveDir = join(this.config.logDir, 'archive');
      if (!existsSync(archiveDir)) {
        const fs = require('fs');
        fs.mkdirSync(archiveDir, { recursive: true });
      }

      if (existsSync(currentPath)) {
        renameSync(currentPath, archivePath);
      }

      this.cleanup();

      return currentPath;
    } catch (error) {
      console.error('[AgentLogger] Rotation failed:', error);
      return null;
    } finally {
      this.rotationInProgress = false;
    }
  }

  cleanup(): void {
    if (!this.config.rotation.enabled) {
      return;
    }

    try {
      const archiveDir = join(this.config.logDir, 'archive');

      if (!existsSync(archiveDir)) {
        return;
      }

      const files = readdirSync(archiveDir)
        .filter((f) => f.endsWith('.ndjson'))
        .map((f) => {
          const path = join(archiveDir, f);
          try {
            const stats = statSync(path);
            return {
              name: f,
              path,
              mtime: stats.mtime,
              size: stats.size,
            };
          } catch (error) {
            return null;
          }
        })
        .filter((f): f is NonNullable<typeof f> => f !== null)
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      if (files.length > this.config.rotation.maxFiles) {
        files.slice(this.config.rotation.maxFiles).forEach((f) => {
          try {
            unlinkSync(f.path);
            console.log(`[AgentLogger] Deleted old log: ${f.name}`);
          } catch (error) {
            console.error(`[AgentLogger] Failed to delete ${f.name}:`, error);
          }
        });
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.rotation.maxAgeDays);

      files.forEach((f) => {
        if (f.mtime < cutoffDate) {
          try {
            unlinkSync(f.path);
            console.log(`[AgentLogger] Deleted expired log: ${f.name}`);
          } catch (error) {
            console.error(`[AgentLogger] Failed to delete ${f.name}:`, error);
          }
        }
      });
    } catch (error) {
      console.error('[AgentLogger] Cleanup failed:', error);
    }
  }

  getCurrentSize(currentPath: string): number {
    try {
      const stats = statSync(currentPath);
      return stats.size / (1024 * 1024);
    } catch (error) {
      return 0;
    }
  }

  getArchivedFiles(): Array<{ name: string; path: string; mtime: Date; size: number }> {
    try {
      const archiveDir = join(this.config.logDir, 'archive');

      if (!existsSync(archiveDir)) {
        return [];
      }

      return readdirSync(archiveDir)
        .filter((f) => f.endsWith('.ndjson'))
        .map((f) => {
          const path = join(archiveDir, f);
          try {
            const stats = statSync(path);
            return {
              name: f,
              path,
              mtime: stats.mtime,
              size: stats.size,
            };
          } catch (error) {
            return null;
          }
        })
        .filter((f): f is NonNullable<typeof f> => f !== null)
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    } catch (error) {
      return [];
    }
  }
}
