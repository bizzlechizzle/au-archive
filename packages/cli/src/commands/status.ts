/**
 * Status Command
 *
 * Shows archive statistics and health status.
 *
 * @module commands/status
 */

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { SQLiteAdapter } from '@au-archive/adapters-local';
import { getConfig } from '../config.js';

/** Archive statistics */
interface ArchiveStats {
  locations: number;
  images: number;
  videos: number;
  documents: number;
  maps: number;
  totalMedia: number;
  recentImports: number;
  corruptedFiles: number;
  lastVerification: string | null;
}

/**
 * Register the status command with the CLI program.
 */
export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show archive statistics and health')
    .option('-l, --location <id>', 'Show status for a specific location')
    .option('--json', 'Output in JSON format')
    .action(async (options) => {
      const spinner = ora('Loading archive status...').start();

      try {
        const config = getConfig();
        const database = new SQLiteAdapter(config.databasePath);

        await database.connect();

        const stats = await getArchiveStats(database, options.location);

        spinner.stop();

        if (options.json) {
          console.log(JSON.stringify(stats, null, 2));
        } else {
          printStatus(stats, config);
        }

        await database.disconnect();
      } catch (error) {
        spinner.fail('Failed to load status');
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

/**
 * Get archive statistics from database.
 */
async function getArchiveStats(
  database: SQLiteAdapter,
  locationId?: string
): Promise<ArchiveStats> {
  // For now, return placeholder stats since we don't have count methods
  // In a real implementation, these would query the database

  const recentImports = await database.getRecentImports(10);
  const corrupted = await database.getCorruptedFiles();

  return {
    locations: 0, // Would need count query
    images: 0,
    videos: 0,
    documents: 0,
    maps: 0,
    totalMedia: 0,
    recentImports: recentImports.length,
    corruptedFiles: corrupted.length,
    lastVerification: corrupted.length > 0 ? corrupted[0].checkedAt : null,
  };
}

/**
 * Print status in human-readable format.
 */
function printStatus(stats: ArchiveStats, config: { databasePath: string; archivePath: string }): void {
  console.log(chalk.cyan('\nAU Archive Status'));
  console.log(chalk.cyan('='.repeat(40)));

  console.log(chalk.white('\nConfiguration:'));
  console.log(`  Database: ${config.databasePath}`);
  console.log(`  Archive:  ${config.archivePath}`);

  console.log(chalk.white('\nContent:'));
  console.log(`  Locations: ${stats.locations}`);
  console.log(`  Images:    ${stats.images}`);
  console.log(`  Videos:    ${stats.videos}`);
  console.log(`  Documents: ${stats.documents}`);
  console.log(`  Maps:      ${stats.maps}`);
  console.log(`  Total:     ${stats.totalMedia}`);

  console.log(chalk.white('\nActivity:'));
  console.log(`  Recent imports: ${stats.recentImports}`);

  console.log(chalk.white('\nHealth:'));
  if (stats.corruptedFiles === 0) {
    console.log(chalk.green('  Status: Healthy'));
  } else {
    console.log(chalk.red(`  Status: ${stats.corruptedFiles} corrupted files`));
  }

  if (stats.lastVerification) {
    console.log(`  Last verification: ${stats.lastVerification}`);
  } else {
    console.log(chalk.yellow('  Last verification: Never'));
  }
}
