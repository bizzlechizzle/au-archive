/**
 * Import Command
 *
 * Imports files into the archive with full pipeline support.
 *
 * @module commands/import
 */

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ImportOrchestrator } from '@au-archive/import-core';
import { SQLiteAdapter, LocalStorageAdapter, ExifToolAdapter } from '@au-archive/adapters-local';
import { getConfig } from '../config.js';

/**
 * Register the import command with the CLI program.
 */
export function registerImportCommand(program: Command): void {
  program
    .command('import <files...>')
    .description('Import files to the archive')
    .requiredOption('-l, --location <id>', 'Target location ID (UUID or loc12)')
    .option('-d, --delete', 'Delete originals after successful import', false)
    .option('--no-verify', 'Skip checksum verification after copy')
    .option('--hardlink', 'Use hardlinks instead of copying (same filesystem only)', false)
    .option('--dry-run', 'Show what would be imported without actually importing')
    .option('--resume <manifest>', 'Resume an interrupted import from manifest file')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (files: string[], options) => {
      const spinner = ora('Initializing...').start();

      try {
        const config = getConfig();

        // Initialize adapters
        const storage = new LocalStorageAdapter();
        const database = new SQLiteAdapter(config.databasePath);
        const metadata = new ExifToolAdapter();

        await database.connect();
        await metadata.initialize();

        // Validate files exist
        spinner.text = 'Validating files...';
        const validatedFiles = await validateFiles(files);

        if (validatedFiles.length === 0) {
          spinner.fail('No valid files to import');
          process.exit(1);
        }

        // Get location
        spinner.text = 'Looking up location...';
        const location = await database.findLocation(options.location)
          ?? await database.findLocationByLoc12(options.location);

        if (!location) {
          spinner.fail(`Location not found: ${options.location}`);
          await cleanup(database, metadata);
          process.exit(1);
        }

        if (options.dryRun) {
          spinner.succeed('Dry run complete');
          console.log(chalk.cyan('\nWould import:'));
          for (const file of validatedFiles) {
            console.log(`  ${file.name} (${formatSize(file.size)})`);
          }
          console.log(chalk.cyan(`\nTo location: ${location.locnam} [${location.loc12}]`));
          await cleanup(database, metadata);
          return;
        }

        // Create orchestrator and run import
        const orchestrator = new ImportOrchestrator(
          {
            archivePath: config.archivePath,
            manifestPath: path.join(config.archivePath, 'manifests'),
          },
          { storage, database, metadata }
        );

        spinner.text = 'Starting import...';
        const result = await orchestrator.import(
          {
            files: validatedFiles,
            locationId: location.locid,
            location: {
              locid: location.locid,
              locnam: location.locnam,
              slocnam: location.slocnam ?? null,
              loc12: location.loc12,
              address_state: location.address_state ?? null,
              type: location.type ?? null,
              gps_lat: location.gps_lat ?? null,
              gps_lng: location.gps_lng ?? null,
            },
            options: {
              deleteOriginals: options.delete,
              useHardlinks: options.hardlink,
              verifyChecksums: options.verify,
            },
          },
          (progress) => {
            const phase = progress.phase.charAt(0).toUpperCase() + progress.phase.slice(1);
            spinner.text = `${phase}: ${progress.percent}%`;
            if (progress.currentFile && options.verbose) {
              spinner.text += ` - ${progress.currentFile}`;
            }
          }
        );

        spinner.succeed('Import complete!');
        printSummary(result.summary, location);

        await cleanup(database, metadata);
      } catch (error) {
        spinner.fail('Import failed');
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });
}

/**
 * Validate that all files exist and are accessible.
 */
async function validateFiles(
  files: string[]
): Promise<Array<{ path: string; name: string; size: number }>> {
  const validated: Array<{ path: string; name: string; size: number }> = [];

  for (const file of files) {
    try {
      const absolutePath = path.resolve(file);
      const stat = await fs.stat(absolutePath);

      if (stat.isFile()) {
        validated.push({
          path: absolutePath,
          name: path.basename(absolutePath),
          size: stat.size,
        });
      } else if (stat.isDirectory()) {
        // Recursively find files in directory
        const dirFiles = await findFilesInDirectory(absolutePath);
        validated.push(...dirFiles);
      }
    } catch {
      console.warn(chalk.yellow(`Warning: Cannot access ${file}, skipping`));
    }
  }

  return validated;
}

/**
 * Recursively find all files in a directory.
 */
async function findFilesInDirectory(
  dir: string
): Promise<Array<{ path: string; name: string; size: number }>> {
  const results: Array<{ path: string; name: string; size: number }> = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isFile() && !entry.name.startsWith('.')) {
      const stat = await fs.stat(fullPath);
      results.push({
        path: fullPath,
        name: entry.name,
        size: stat.size,
      });
    } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
      const subFiles = await findFilesInDirectory(fullPath);
      results.push(...subFiles);
    }
  }

  return results;
}

/**
 * Print import summary.
 */
function printSummary(
  summary: { total: number; imported: number; duplicates: number; errors: number },
  location: { locnam: string; loc12: string }
): void {
  console.log(chalk.cyan('\nImport Summary:'));
  console.log(`  Location: ${location.locnam} [${location.loc12}]`);
  console.log(`  Total files: ${summary.total}`);
  console.log(chalk.green(`  Imported: ${summary.imported}`));
  if (summary.duplicates > 0) {
    console.log(chalk.yellow(`  Duplicates: ${summary.duplicates}`));
  }
  if (summary.errors > 0) {
    console.log(chalk.red(`  Errors: ${summary.errors}`));
  }
}

/**
 * Format file size for display.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Cleanup adapters.
 */
async function cleanup(database: SQLiteAdapter, metadata: ExifToolAdapter): Promise<void> {
  await database.disconnect();
  await metadata.shutdown();
}
