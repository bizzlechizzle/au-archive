/**
 * AU Archive CLI
 *
 * Command line interface for the AU Archive system.
 *
 * Usage:
 *   au-archive import <files...> -l <location>
 *   au-archive verify [--all|--location <id>]
 *   au-archive status
 *
 * @module @au-archive/cli
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { loadConfig } from './config.js';
import {
  registerImportCommand,
  registerVerifyCommand,
  registerStatusCommand,
} from './commands/index.js';

const VERSION = '0.1.0';

/**
 * Main CLI entry point.
 */
async function main(): Promise<void> {
  const program = new Command();

  program
    .name('au-archive')
    .description('AU Archive - CLI for abandoned urbex photo archive management')
    .version(VERSION)
    .option('-c, --config <path>', 'Path to config file')
    .hook('preAction', async (thisCommand) => {
      // Load config before any command runs
      const configPath = thisCommand.opts().config;
      await loadConfig(configPath);
    });

  // Register commands
  registerImportCommand(program);
  registerVerifyCommand(program);
  registerStatusCommand(program);

  // Add init command for first-time setup
  program
    .command('init')
    .description('Initialize a new archive')
    .option('-p, --path <path>', 'Archive storage path')
    .option('-d, --database <path>', 'Database file path')
    .action(async (options) => {
      console.log(chalk.cyan('Initializing AU Archive...'));

      // Create directories and initialize database
      const config = await loadConfig();
      const archivePath = options.path ?? config.archivePath;
      const dbPath = options.database ?? config.databasePath;

      console.log(`  Archive path: ${archivePath}`);
      console.log(`  Database: ${dbPath}`);

      // Import adapters and create database
      const { SQLiteAdapter } = await import('@au-archive/adapters-local');
      const { mkdir } = await import('node:fs/promises');
      const { dirname } = await import('node:path');

      // Create directories
      await mkdir(archivePath, { recursive: true });
      await mkdir(dirname(dbPath), { recursive: true });

      // Initialize database (creates tables)
      const db = new SQLiteAdapter(dbPath);
      await db.connect();
      await db.disconnect();

      console.log(chalk.green('\nArchive initialized successfully!'));
      console.log(chalk.cyan('\nNext steps:'));
      console.log('  1. Create a location: (use desktop app or direct DB)');
      console.log('  2. Import files: au-archive import <files> -l <location-id>');
    });

  // Error handling
  program.exitOverride((err) => {
    if (err.code === 'commander.help') {
      process.exit(0);
    }
    if (err.code === 'commander.version') {
      process.exit(0);
    }
    console.error(chalk.red(`Error: ${err.message}`));
    process.exit(1);
  });

  // Parse arguments
  await program.parseAsync(process.argv);
}

// Run CLI
main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
