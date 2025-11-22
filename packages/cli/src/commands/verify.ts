/**
 * Verify Command
 *
 * Verifies archive integrity using fixity checks.
 *
 * @module commands/verify
 */

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { FixityService } from '@au-archive/import-core';
import { SQLiteAdapter, LocalStorageAdapter } from '@au-archive/adapters-local';
import { getConfig } from '../config.js';

/**
 * Register the verify command with the CLI program.
 */
export function registerVerifyCommand(program: Command): void {
  program
    .command('verify')
    .description('Verify archive integrity')
    .option('-l, --location <id>', 'Verify files for a specific location')
    .option('-a, --all', 'Verify all files in the archive')
    .option('-s, --sample <n>', 'Verify a random sample of n files')
    .option('--since <days>', 'Only verify files not checked in the last n days', '30')
    .option('--fix', 'Attempt to fix corrupted files from backups')
    .option('-v, --verbose', 'Show detailed verification progress')
    .action(async (options) => {
      const spinner = ora('Initializing...').start();

      try {
        const config = getConfig();

        // Initialize adapters
        const storage = new LocalStorageAdapter();
        const database = new SQLiteAdapter(config.databasePath);

        await database.connect();

        // Create fixity service
        const fixity = new FixityService({ storage, database });

        // Determine verification scope
        let scope: string;
        if (options.location) {
          scope = `location ${options.location}`;
        } else if (options.sample) {
          scope = `${options.sample} random files`;
        } else if (options.all) {
          scope = 'all files';
        } else {
          scope = 'files needing verification';
        }

        spinner.text = `Verifying ${scope}...`;

        // Get files needing verification
        const since = new Date();
        since.setDate(since.getDate() - parseInt(options.since));

        const result = await fixity.verify({
          locationId: options.location,
          all: options.all,
          sampleSize: options.sample ? parseInt(options.sample) : undefined,
          notVerifiedSince: since,
          actor: 'cli:verify',
        });

        // Show results
        if (result.corrupted === 0 && result.missing === 0) {
          spinner.succeed(chalk.green('Verification complete - all files valid'));
        } else {
          spinner.warn(chalk.yellow('Verification complete - issues found'));
        }

        printVerificationSummary(result);

        // Show corrupted files
        if (result.corrupted > 0 || result.missing > 0) {
          const issues = await database.getCorruptedFiles();
          console.log(chalk.red('\nIssues:'));
          for (const issue of issues.slice(0, 10)) {
            const icon = issue.status === 'corrupted' ? 'x' : '?';
            console.log(chalk.red(`  [${icon}] ${issue.filePath} (${issue.status})`));
          }
          if (issues.length > 10) {
            console.log(chalk.red(`  ... and ${issues.length - 10} more`));
          }
        }

        await database.disconnect();
      } catch (error) {
        spinner.fail('Verification failed');
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

/**
 * Print verification summary.
 */
function printVerificationSummary(result: {
  checked: number;
  valid: number;
  corrupted: number;
  missing: number;
  errors: number;
}): void {
  console.log(chalk.cyan('\nVerification Summary:'));
  console.log(`  Total checked: ${result.checked}`);
  console.log(chalk.green(`  Valid: ${result.valid}`));
  if (result.corrupted > 0) {
    console.log(chalk.red(`  Corrupted: ${result.corrupted}`));
  }
  if (result.missing > 0) {
    console.log(chalk.red(`  Missing: ${result.missing}`));
  }
  if (result.errors > 0) {
    console.log(chalk.yellow(`  Errors: ${result.errors}`));
  }
}
