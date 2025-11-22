/**
 * CLI Configuration Loader
 *
 * Uses cosmiconfig to load config from multiple sources:
 * - au-archive.config.js
 * - .au-archiverc.json
 * - package.json "au-archive" key
 * - Environment variables
 *
 * @module config
 */

import { cosmiconfig } from 'cosmiconfig';
import * as path from 'node:path';
import * as os from 'node:os';

/** CLI configuration schema */
export interface CLIConfig {
  /** Path to SQLite database */
  databasePath: string;
  /** Path to archive storage root */
  archivePath: string;
  /** Default import options */
  import: {
    deleteOriginals: boolean;
    useHardlinks: boolean;
    verifyChecksums: boolean;
    useRsync: boolean;
  };
  /** Fixity verification options */
  verify: {
    /** Days between automatic verification */
    intervalDays: number;
    /** Check on startup */
    onStartup: boolean;
  };
}

/** Default configuration */
const defaultConfig: CLIConfig = {
  databasePath: path.join(os.homedir(), '.au-archive', 'archive.db'),
  archivePath: path.join(os.homedir(), '.au-archive', 'media'),
  import: {
    deleteOriginals: false,
    useHardlinks: false,
    verifyChecksums: true,
    useRsync: true,
  },
  verify: {
    intervalDays: 30,
    onStartup: false,
  },
};

/** Loaded configuration (cached) */
let cachedConfig: CLIConfig | null = null;

/**
 * Load CLI configuration from various sources.
 *
 * Priority (highest first):
 * 1. Environment variables (AU_ARCHIVE_*)
 * 2. Config file (au-archive.config.js, .au-archiverc, etc.)
 * 3. Default values
 */
export async function loadConfig(configPath?: string): Promise<CLIConfig> {
  if (cachedConfig && !configPath) {
    return cachedConfig;
  }

  const explorer = cosmiconfig('au-archive');
  let fileConfig: Partial<CLIConfig> = {};

  try {
    const result = configPath
      ? await explorer.load(configPath)
      : await explorer.search();

    if (result && !result.isEmpty) {
      fileConfig = result.config as Partial<CLIConfig>;
    }
  } catch {
    // Config file not found or invalid, use defaults
  }

  // Merge with environment variables
  const envConfig = loadEnvConfig();

  // Deep merge: defaults < file < env
  const config: CLIConfig = {
    databasePath: envConfig.databasePath ?? fileConfig.databasePath ?? defaultConfig.databasePath,
    archivePath: envConfig.archivePath ?? fileConfig.archivePath ?? defaultConfig.archivePath,
    import: {
      ...defaultConfig.import,
      ...fileConfig.import,
      ...envConfig.import,
    },
    verify: {
      ...defaultConfig.verify,
      ...fileConfig.verify,
      ...envConfig.verify,
    },
  };

  cachedConfig = config;
  return config;
}

/**
 * Load configuration from environment variables.
 */
function loadEnvConfig(): Partial<CLIConfig> {
  const config: Partial<CLIConfig> = {};

  if (process.env.AU_ARCHIVE_DATABASE_PATH) {
    config.databasePath = process.env.AU_ARCHIVE_DATABASE_PATH;
  }

  if (process.env.AU_ARCHIVE_PATH) {
    config.archivePath = process.env.AU_ARCHIVE_PATH;
  }

  if (process.env.AU_ARCHIVE_DELETE_ORIGINALS) {
    config.import = {
      ...config.import,
      deleteOriginals: process.env.AU_ARCHIVE_DELETE_ORIGINALS === 'true',
    } as CLIConfig['import'];
  }

  if (process.env.AU_ARCHIVE_USE_RSYNC) {
    config.import = {
      ...config.import,
      useRsync: process.env.AU_ARCHIVE_USE_RSYNC === 'true',
    } as CLIConfig['import'];
  }

  return config;
}

/**
 * Get cached config or throw if not loaded.
 */
export function getConfig(): CLIConfig {
  if (!cachedConfig) {
    throw new Error('Config not loaded. Call loadConfig() first.');
  }
  return cachedConfig;
}

/**
 * Clear cached config (for testing).
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}
