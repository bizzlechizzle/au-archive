/**
 * Integration Test - Full Archive Pipeline
 *
 * Tests the complete workflow:
 * 1. Initialize database with locations
 * 2. Create sample files
 * 3. Import files to archive
 * 4. Verify integrity
 * 5. Check status
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { SQLiteAdapter, LocalStorageAdapter, ExifToolAdapter } from '@au-archive/adapters-local';
import {
  ImportOrchestrator,
  FixityService,
  type LocationRef,
  type Location
} from '@au-archive/import-core';

const TEST_DIR = '/tmp/au-archive-test';
const ARCHIVE_PATH = path.join(TEST_DIR, 'archive');
const MANIFEST_PATH = path.join(TEST_DIR, 'manifests');
const DB_PATH = path.join(TEST_DIR, 'test.db');
const SOURCE_PATH = path.join(TEST_DIR, 'source');

async function cleanup() {
  try {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
}

async function setup() {
  await cleanup();

  // Create directory structure
  await fs.mkdir(TEST_DIR, { recursive: true });
  await fs.mkdir(ARCHIVE_PATH, { recursive: true });
  await fs.mkdir(MANIFEST_PATH, { recursive: true });
  await fs.mkdir(SOURCE_PATH, { recursive: true });

  console.log('✓ Created test directories');
}

async function createSampleFiles(): Promise<Array<{ path: string; name: string; size: number }>> {
  const files: Array<{ path: string; name: string; size: number }> = [];

  // Create sample "image" files (just text files for testing)
  for (let i = 1; i <= 3; i++) {
    const name = `photo_${i}.jpg`;
    const filePath = path.join(SOURCE_PATH, name);
    const content = `FAKE_JPEG_DATA_${i}_${randomUUID()}\n`.repeat(100);
    await fs.writeFile(filePath, content);
    const stat = await fs.stat(filePath);
    files.push({ path: filePath, name, size: stat.size });
  }

  // Create sample "document" files
  for (let i = 1; i <= 2; i++) {
    const name = `document_${i}.pdf`;
    const filePath = path.join(SOURCE_PATH, name);
    const content = `%PDF-FAKE_DOCUMENT_${i}_${randomUUID()}\n`.repeat(50);
    await fs.writeFile(filePath, content);
    const stat = await fs.stat(filePath);
    files.push({ path: filePath, name, size: stat.size });
  }

  console.log(`✓ Created ${files.length} sample files`);
  return files;
}

function locationToRef(loc: Location): LocationRef {
  return {
    locid: loc.locid,
    locnam: loc.locnam,
    slocnam: loc.slocnam ?? null,
    loc12: loc.loc12,
    address_state: loc.address_state ?? null,
    type: loc.type ?? null,
    gps_lat: loc.gps_lat ?? null,
    gps_lng: loc.gps_lng ?? null,
  };
}

async function createLocations(database: SQLiteAdapter): Promise<LocationRef[]> {
  // Location 1: Abandoned Hospital
  const loc1 = await database.createLocation({
    locnam: 'Willowbrook State School',
    slocnam: 'Building 7 - Main Hospital',
    address_state: 'NY',
    type: 'hospital',
    gps_lat: 40.5835,
    gps_lng: -74.1644,
  });

  // Location 2: Abandoned Factory
  const loc2 = await database.createLocation({
    locnam: 'Bethlehem Steel',
    slocnam: 'Blast Furnace Area',
    address_state: 'PA',
    type: 'industrial',
    gps_lat: 40.6084,
    gps_lng: -75.3821,
  });

  const locations = [locationToRef(loc1), locationToRef(loc2)];
  console.log(`✓ Created ${locations.length} sample locations`);
  console.log(`  - ${loc1.locnam} [${loc1.loc12}]`);
  console.log(`  - ${loc2.locnam} [${loc2.loc12}]`);

  return locations;
}

async function runImportTest(
  orchestrator: ImportOrchestrator,
  files: Array<{ path: string; name: string; size: number }>,
  location: LocationRef
) {
  console.log(`\n→ Importing ${files.length} files to ${location.locnam}...`);

  const result = await orchestrator.import(
    {
      files,
      locationId: location.locid,
      location,
      options: {
        deleteOriginals: false,
        useHardlinks: false,
        verifyChecksums: true,
      },
      authImp: 'test-user',
    },
    (progress) => {
      process.stdout.write(`\r  ${progress.phase}: ${progress.percent}%   `);
    }
  );

  console.log('\n');
  console.log(`  Import ID: ${result.importId}`);
  console.log(`  Success: ${result.success}`);
  console.log(`  Summary: ${result.summary.imported} imported, ${result.summary.duplicates} duplicates, ${result.summary.errors} errors`);

  return result;
}

async function runVerifyTest(fixity: FixityService) {
  console.log('\n→ Running verification...');

  const result = await fixity.verify({
    all: true,
    actor: 'test:verify',
  });

  console.log(`  Checked: ${result.checked}`);
  console.log(`  Valid: ${result.valid}`);
  console.log(`  Corrupted: ${result.corrupted}`);
  console.log(`  Missing: ${result.missing}`);
  console.log(`  Duration: ${result.duration}ms`);

  return result;
}

async function runStatusTest(database: SQLiteAdapter) {
  console.log('\n→ Archive Status:');

  // Get recent imports to count media
  const imports = await database.getRecentImports(100);

  let totalImages = 0;
  let totalVideos = 0;
  let totalDocs = 0;
  let totalMaps = 0;

  for (const imp of imports) {
    totalImages += imp.imgCount;
    totalVideos += imp.vidCount;
    totalDocs += imp.docCount;
    totalMaps += imp.mapCount;
  }

  console.log(`  Total Imports: ${imports.length}`);
  console.log(`  Total Images: ${totalImages}`);
  console.log(`  Total Videos: ${totalVideos}`);
  console.log(`  Total Documents: ${totalDocs}`);
  console.log(`  Total Maps: ${totalMaps}`);

  return { imports: imports.length, images: totalImages, videos: totalVideos, docs: totalDocs };
}

async function listArchiveContents() {
  console.log('\n→ Archive Contents:');

  try {
    const walk = async (dir: string, prefix: string = '') => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          console.log(`  ${prefix}📁 ${entry.name}/`);
          await walk(fullPath, prefix + '  ');
        } else {
          const stat = await fs.stat(fullPath);
          console.log(`  ${prefix}📄 ${entry.name} (${formatSize(stat.size)})`);
        }
      }
    };
    await walk(ARCHIVE_PATH);
  } catch {
    console.log('  (empty)');
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  AU-ARCHIVE Integration Test');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Setup
    await setup();

    // Initialize adapters
    const storage = new LocalStorageAdapter();
    const database = new SQLiteAdapter(DB_PATH);
    const metadata = new ExifToolAdapter();

    await database.connect();
    await metadata.initialize();

    console.log('✓ Initialized adapters');
    console.log(`  Database: ${DB_PATH}`);
    console.log(`  Archive: ${ARCHIVE_PATH}`);

    // Create locations
    const locations = await createLocations(database);

    // Create sample files
    const files = await createSampleFiles();

    // Create orchestrator
    const orchestrator = new ImportOrchestrator(
      { archivePath: ARCHIVE_PATH, manifestPath: MANIFEST_PATH },
      { storage, database, metadata }
    );

    // Run imports for each location
    const loc1Files = files.slice(0, 3); // 3 photos
    const loc2Files = files.slice(3);     // 2 documents

    const import1 = await runImportTest(orchestrator, loc1Files, locations[0]);
    const import2 = await runImportTest(orchestrator, loc2Files, locations[1]);

    // Create fixity service
    const fixity = new FixityService({ storage, database });

    // Run verification
    const verifyResult = await runVerifyTest(fixity);

    // Run status
    await runStatusTest(database);

    // List archive contents
    await listArchiveContents();

    // Cleanup adapters
    await database.disconnect();
    await metadata.shutdown();

    // Final audit
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  AUDIT RESULTS');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const checks = [
      { name: 'Database initialized', pass: true },
      { name: 'Locations created', pass: locations.length === 2 },
      { name: 'Files imported', pass: import1.success && import2.success },
      { name: 'Import 1: 3 files', pass: import1.summary.imported === 3 },
      { name: 'Import 2: 2 files', pass: import2.summary.imported === 2 },
      { name: 'No duplicates', pass: import1.summary.duplicates === 0 && import2.summary.duplicates === 0 },
      { name: 'No errors', pass: import1.summary.errors === 0 && import2.summary.errors === 0 },
      { name: 'Verification passed', pass: verifyResult.corrupted === 0 && verifyResult.missing === 0 },
      { name: 'All files valid', pass: verifyResult.valid === verifyResult.checked },
    ];

    let passed = 0;
    for (const check of checks) {
      const icon = check.pass ? '✓' : '✗';
      const color = check.pass ? '' : '[FAIL] ';
      console.log(`  ${icon} ${color}${check.name}`);
      if (check.pass) passed++;
    }

    console.log(`\n  Score: ${passed}/${checks.length} (${Math.round(passed / checks.length * 100)}%)`);

    if (passed === checks.length) {
      console.log('\n  🎉 THIS IS A WORKING ARCHIVE! 🎉\n');
    } else {
      console.log('\n  ⚠️  Some checks failed\n');
    }

  } catch (error) {
    console.error('\n✗ TEST FAILED:', error);
    process.exit(1);
  }
}

main();
