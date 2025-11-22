/**
 * Config Module Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, getConfig, clearConfigCache } from '../../src/config.js';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Config', () => {
  beforeEach(() => {
    clearConfigCache();
    // Clear environment variables
    delete process.env.AU_ARCHIVE_DATABASE_PATH;
    delete process.env.AU_ARCHIVE_PATH;
    delete process.env.AU_ARCHIVE_DELETE_ORIGINALS;
    delete process.env.AU_ARCHIVE_USE_RSYNC;
  });

  afterEach(() => {
    clearConfigCache();
  });

  describe('loadConfig', () => {
    it('should return default config when no config file exists', async () => {
      const config = await loadConfig();

      expect(config.databasePath).toContain('.au-archive');
      expect(config.archivePath).toContain('.au-archive');
      expect(config.import.deleteOriginals).toBe(false);
      expect(config.import.verifyChecksums).toBe(true);
      expect(config.verify.intervalDays).toBe(30);
    });

    it('should use environment variables when set', async () => {
      process.env.AU_ARCHIVE_DATABASE_PATH = '/custom/path/db.sqlite';
      process.env.AU_ARCHIVE_PATH = '/custom/archive';

      const config = await loadConfig();

      expect(config.databasePath).toBe('/custom/path/db.sqlite');
      expect(config.archivePath).toBe('/custom/archive');
    });

    it('should parse boolean environment variables', async () => {
      process.env.AU_ARCHIVE_DELETE_ORIGINALS = 'true';
      process.env.AU_ARCHIVE_USE_RSYNC = 'false';

      const config = await loadConfig();

      expect(config.import.deleteOriginals).toBe(true);
      expect(config.import.useRsync).toBe(false);
    });

    it('should cache config after first load', async () => {
      const config1 = await loadConfig();
      process.env.AU_ARCHIVE_DATABASE_PATH = '/changed/path';
      const config2 = await loadConfig();

      // Should return same cached config
      expect(config1).toBe(config2);
    });

    it('should reload config when path is specified', async () => {
      await loadConfig();
      // Specifying a path should bypass cache
      // (even if file doesn't exist, it should attempt to load)
      const config = await loadConfig('/nonexistent/config.json');
      expect(config).toBeDefined();
    });
  });

  describe('getConfig', () => {
    it('should throw when config not loaded', () => {
      expect(() => getConfig()).toThrow('Config not loaded');
    });

    it('should return config after loading', async () => {
      await loadConfig();
      const config = getConfig();
      expect(config).toBeDefined();
      expect(config.databasePath).toBeDefined();
    });
  });

  describe('clearConfigCache', () => {
    it('should clear cached config', async () => {
      await loadConfig();
      clearConfigCache();
      expect(() => getConfig()).toThrow('Config not loaded');
    });
  });

  describe('default paths', () => {
    it('should use home directory for default paths', async () => {
      const config = await loadConfig();
      const homeDir = os.homedir();

      expect(config.databasePath).toContain(homeDir);
      expect(config.archivePath).toContain(homeDir);
    });

    it('should have sensible default import options', async () => {
      const config = await loadConfig();

      expect(config.import.deleteOriginals).toBe(false);
      expect(config.import.useHardlinks).toBe(false);
      expect(config.import.verifyChecksums).toBe(true);
      expect(config.import.useRsync).toBe(true);
    });

    it('should have sensible default verify options', async () => {
      const config = await loadConfig();

      expect(config.verify.intervalDays).toBe(30);
      expect(config.verify.onStartup).toBe(false);
    });
  });
});
