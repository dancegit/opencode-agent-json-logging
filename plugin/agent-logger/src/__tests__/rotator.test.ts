import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { LogRotator } from '../rotator.js';
import type { LoggerConfig } from '../types.js';

describe('LogRotator', () => {
  let testDir: string;
  let config: LoggerConfig;
  let rotator: LogRotator;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-logs-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    
    config = {
      logDir: testDir,
      filenamePattern: 'test-{YYYY-MM-DD}.ndjson',
      rotation: {
        enabled: true,
        maxSizeMB: 1,
        maxFiles: 3,
        maxAgeDays: 7,
        compress: true,
        compressionLevel: 6,
      },
      verbosity: 'info',
      excludedEvents: [],
      timestampFormat: 'ISO',
      includeSessionContext: true,
      buffering: {
        enabled: true,
        flushIntervalMs: 100,
        highWatermarkBytes: 16384,
      },
    };
    
    rotator = new LogRotator(config);
  });

  afterEach(() => {
    try {
      const files = require('fs').readdirSync(testDir);
      files.forEach((f: string) => {
        unlinkSync(join(testDir, f));
      });
      rmdirSync(testDir);
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('compression', () => {
    it('should compress rotated logs when compress is enabled', () => {
      const logFile = join(testDir, 'test.ndjson');
      // Create a file larger than maxSizeMB (1MB = 1,048,576 bytes)
      const largeContent = 'x'.repeat(2 * 1024 * 1024);
      writeFileSync(logFile, largeContent);
      
      const result = rotator.checkRotation(logFile);
      
      expect(result).toBe(logFile);
      expect(existsSync(logFile)).toBe(false);
      
      const archiveDir = join(testDir, 'archive');
      expect(existsSync(archiveDir)).toBe(true);
      
      const files = require('fs').readdirSync(archiveDir);
      const gzFile = files.find((f: string) => f.endsWith('.ndjson.gz'));
      expect(gzFile).toBeDefined();
      
      // Verify it's actually compressed (should be smaller)
      const gzPath = join(archiveDir, gzFile);
      const gzStats = statSync(gzPath);
      expect(gzStats.size).toBeLessThan(Buffer.byteLength(largeContent));
    });

    it('should not compress when compress is disabled', () => {
      config.rotation.compress = false;
      rotator = new LogRotator(config);
      
      const logFile = join(testDir, 'test.ndjson');
      const largeContent = 'x'.repeat(2 * 1024 * 1024);
      writeFileSync(logFile, largeContent);
      
      const result = rotator.checkRotation(logFile);
      
      expect(result).toBe(logFile);
      
      const archiveDir = join(testDir, 'archive');
      const files = require('fs').readdirSync(archiveDir);
      const uncompressedFile = files.find((f: string) => f.endsWith('.ndjson') && !f.endsWith('.gz'));
      expect(uncompressedFile).toBeDefined();
    });

    it('should use different compression levels', () => {
      const logFile = join(testDir, 'test.ndjson');
      const largeContent = 'x'.repeat(2 * 1024 * 1024);
      
      config.rotation.compressionLevel = 1;
      rotator = new LogRotator(config);
      writeFileSync(logFile, largeContent);
      rotator.checkRotation(logFile);
      
      const archiveDir1 = join(testDir, 'archive');
      const files1 = require('fs').readdirSync(archiveDir1);
      const gzFile1 = join(archiveDir1, files1[0]);
      const size1 = statSync(gzFile1).size;
      
      // Clean up and test with level 9 (slow, more compression)
      unlinkSync(gzFile1);
      config.rotation.compressionLevel = 9;
      rotator = new LogRotator(config);
      writeFileSync(logFile, largeContent);
      rotator.checkRotation(logFile);
      
      const files2 = require('fs').readdirSync(archiveDir1);
      const gzFile2 = join(archiveDir1, files2[0]);
      const size2 = statSync(gzFile2).size;
      
      // Level 9 should produce smaller file (or equal)
      expect(size2).toBeLessThanOrEqual(size1);
    });
  });

  describe('rotation trigger', () => {
    it('should not rotate when file is smaller than maxSizeMB', () => {
      const logFile = join(testDir, 'test.ndjson');
      writeFileSync(logFile, 'small content');
      
      const result = rotator.checkRotation(logFile);
      
      expect(result).toBeNull();
      expect(existsSync(logFile)).toBe(true);
    });

    it('should rotate when file exceeds maxSizeMB', () => {
      const logFile = join(testDir, 'test.ndjson');
      const content = 'x'.repeat(2 * 1024 * 1024); // 2MB
      writeFileSync(logFile, content);
      
      const result = rotator.checkRotation(logFile);
      
      expect(result).toBe(logFile);
      expect(existsSync(logFile)).toBe(false);
    });

    it('should return null when rotation is disabled', () => {
      config.rotation.enabled = false;
      rotator = new LogRotator(config);
      
      const logFile = join(testDir, 'test.ndjson');
      const content = 'x'.repeat(2 * 1024 * 1024);
      writeFileSync(logFile, content);
      
      const result = rotator.checkRotation(logFile);
      
      expect(result).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should respect maxFiles limit', () => {
      const archiveDir = join(testDir, 'archive');
      mkdirSync(archiveDir, { recursive: true });
      
      // Create 5 archive files
      for (let i = 0; i < 5; i++) {
        writeFileSync(
          join(archiveDir, `test-${i}.ndjson.gz`),
          'compressed content'
        );
      }
      
      config.rotation.maxFiles = 3;
      rotator = new LogRotator(config);
      rotator.cleanup();
      
      const files = require('fs').readdirSync(archiveDir);
      expect(files.length).toBe(3);
    });

    it('should delete files older than maxAgeDays', () => {
      const archiveDir = join(testDir, 'archive');
      mkdirSync(archiveDir, { recursive: true });
      
      // Create a file with old timestamp
      const oldFile = join(archiveDir, 'old.ndjson.gz');
      writeFileSync(oldFile, 'content');
      
      // Manually set mtime to 10 days ago
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      require('fs').utimesSync(oldFile, oldDate, oldDate);
      
      rotator.cleanup();
      
      expect(existsSync(oldFile)).toBe(false);
    });
  });

  describe('getCurrentSize', () => {
    it('should return file size in MB', () => {
      const logFile = join(testDir, 'test.ndjson');
      const content = 'x'.repeat(1024 * 1024); // 1MB
      writeFileSync(logFile, content);
      
      const size = rotator.getCurrentSize(logFile);
      
      expect(size).toBeGreaterThan(0.9);
      expect(size).toBeLessThanOrEqual(1.1);
    });

    it('should return 0 for non-existent file', () => {
      const size = rotator.getCurrentSize(join(testDir, 'nonexistent.ndjson'));
      expect(size).toBe(0);
    });
  });

  describe('getArchivedFiles', () => {
    it('should return list of archived files', () => {
      const archiveDir = join(testDir, 'archive');
      mkdirSync(archiveDir, { recursive: true });
      
      writeFileSync(join(archiveDir, 'test1.ndjson.gz'), 'content1');
      writeFileSync(join(archiveDir, 'test2.ndjson'), 'content2');
      
      const files = rotator.getArchivedFiles();
      
      expect(files.length).toBe(2);
      expect(files[0]).toHaveProperty('name');
      expect(files[0]).toHaveProperty('path');
      expect(files[0]).toHaveProperty('mtime');
      expect(files[0]).toHaveProperty('size');
    });

    it('should return empty array when archive dir does not exist', () => {
      const files = rotator.getArchivedFiles();
      expect(files).toEqual([]);
    });
  });
});
