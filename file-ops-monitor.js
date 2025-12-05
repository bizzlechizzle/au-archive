#!/usr/bin/env node

/**
 * FILE OPERATION MONITOR & TESTER
 * 
 * Quick utility to test and monitor hardlink vs copy operations
 * Run this to understand what's happening with your file operations
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// ============================================================================
// SECTION 1: DETECTION UTILITIES
// ============================================================================

/**
 * Check if two paths are on the same device (can use hardlinks)
 */
async function isSameDevice(path1, path2) {
  try {
    const stat1 = await fs.stat(path1);
    const stat2 = await fs.stat(path2);
    
    console.log(`\n📊 Device Check:`);
    console.log(`  ${path1} → device ${stat1.dev}`);
    console.log(`  ${path2} → device ${stat2.dev}`);
    console.log(`  Same device: ${stat1.dev === stat2.dev ? '✅ YES' : '❌ NO'}`);
    
    return stat1.dev === stat2.dev;
  } catch (error) {
    console.error('❌ Error checking devices:', error.message);
    return false;
  }
}

/**
 * Get inode information for a file
 */
async function getInodeInfo(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return {
      inode: stats.ino,
      nlink: stats.nlink,
      size: stats.size,
      dev: stats.dev,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Check if two files are hardlinked
 */
async function areHardlinked(file1, file2) {
  const info1 = await getInodeInfo(file1);
  const info2 = await getInodeInfo(file2);
  
  if (!info1 || !info2) {
    return false;
  }
  
  const linked = info1.inode === info2.inode && info1.dev === info2.dev;
  
  console.log(`\n🔗 Hardlink Check:`);
  console.log(`  ${file1}`);
  console.log(`    inode: ${info1.inode}, links: ${info1.nlink}`);
  console.log(`  ${file2}`);
  console.log(`    inode: ${info2.inode}, links: ${info2.nlink}`);
  console.log(`  Hardlinked: ${linked ? '✅ YES' : '❌ NO'}`);
  
  return linked;
}

/**
 * Visual comparison of file stats
 */
async function compareFiles(file1, file2) {
  const info1 = await getInodeInfo(file1);
  const info2 = await getInodeInfo(file2);
  
  if (!info1 || !info2) {
    console.log('❌ One or both files do not exist');
    return;
  }
  
  console.log(`\n📋 File Comparison:`);
  console.log(`┌─────────────────────────────────────────────────────────────┐`);
  console.log(`│ Attribute       │ File 1          │ File 2          │ Match │`);
  console.log(`├─────────────────────────────────────────────────────────────┤`);
  console.log(`│ Inode           │ ${String(info1.inode).padEnd(15)} │ ${String(info2.inode).padEnd(15)} │ ${info1.inode === info2.inode ? '✅' : '❌'}    │`);
  console.log(`│ Device          │ ${String(info1.dev).padEnd(15)} │ ${String(info2.dev).padEnd(15)} │ ${info1.dev === info2.dev ? '✅' : '❌'}    │`);
  console.log(`│ Size            │ ${String(info1.size).padEnd(15)} │ ${String(info2.size).padEnd(15)} │ ${info1.size === info2.size ? '✅' : '❌'}    │`);
  console.log(`│ Link Count      │ ${String(info1.nlink).padEnd(15)} │ ${String(info2.nlink).padEnd(15)} │ ${info1.nlink === info2.nlink ? '✅' : '❌'}    │`);
  console.log(`└─────────────────────────────────────────────────────────────┘`);
  
  if (info1.inode === info2.inode) {
    console.log(`\n💡 Result: HARDLINKED (same inode = same physical file)`);
  } else {
    console.log(`\n💡 Result: SEPARATE COPIES (different inodes = different physical files)`);
  }
}

// ============================================================================
// SECTION 2: TEST OPERATIONS
// ============================================================================

/**
 * Test hardlink creation
 */
async function testHardlink(sourcePath, destPath) {
  console.log(`\n🧪 Testing hardlink creation...`);
  console.log(`  Source: ${sourcePath}`);
  console.log(`  Dest:   ${destPath}`);
  
  try {
    // Get source inode before
    const beforeInfo = await getInodeInfo(sourcePath);
    console.log(`  Source inode before: ${beforeInfo.inode} (links: ${beforeInfo.nlink})`);
    
    const startTime = Date.now();
    await fs.link(sourcePath, destPath);
    const duration = Date.now() - startTime;
    
    // Get info after
    const afterSourceInfo = await getInodeInfo(sourcePath);
    const destInfo = await getInodeInfo(destPath);
    
    console.log(`  ✅ Hardlink created in ${duration}ms`);
    console.log(`  Source inode after:  ${afterSourceInfo.inode} (links: ${afterSourceInfo.nlink})`);
    console.log(`  Dest inode:          ${destInfo.inode} (links: ${destInfo.nlink})`);
    console.log(`  Link count increased: ${beforeInfo.nlink} → ${afterSourceInfo.nlink}`);
    
    return { success: true, duration, strategy: 'hardlink' };
  } catch (error) {
    console.log(`  ❌ Hardlink failed: ${error.message}`);
    return { success: false, error: error.message, strategy: 'hardlink' };
  }
}

/**
 * Test reflink (APFS/Btrfs copy-on-write)
 */
async function testReflink(sourcePath, destPath) {
  console.log(`\n🧪 Testing reflink (copy-on-write)...`);
  console.log(`  Source: ${sourcePath}`);
  console.log(`  Dest:   ${destPath}`);
  
  try {
    const startTime = Date.now();
    
    // Node.js doesn't have native reflink support, use cp command
    if (process.platform === 'darwin') {
      // macOS: use cp with -c flag
      await execAsync(`cp -c "${sourcePath}" "${destPath}"`);
    } else if (process.platform === 'linux') {
      // Linux: use cp with --reflink=always
      await execAsync(`cp --reflink=always "${sourcePath}" "${destPath}"`);
    } else {
      throw new Error('Reflink not supported on this platform');
    }
    
    const duration = Date.now() - startTime;
    
    const sourceInfo = await getInodeInfo(sourcePath);
    const destInfo = await getInodeInfo(destPath);
    
    console.log(`  ✅ Reflink created in ${duration}ms`);
    console.log(`  Source inode: ${sourceInfo.inode}`);
    console.log(`  Dest inode:   ${destInfo.inode} (different, but shares blocks)`);
    
    return { success: true, duration, strategy: 'reflink' };
  } catch (error) {
    console.log(`  ❌ Reflink failed: ${error.message}`);
    return { success: false, error: error.message, strategy: 'reflink' };
  }
}

/**
 * Test regular copy
 */
async function testCopy(sourcePath, destPath) {
  console.log(`\n🧪 Testing regular copy...`);
  console.log(`  Source: ${sourcePath}`);
  console.log(`  Dest:   ${destPath}`);
  
  try {
    const sourceInfo = await getInodeInfo(sourcePath);
    const startTime = Date.now();
    
    await fs.copyFile(sourcePath, destPath);
    
    const duration = Date.now() - startTime;
    const destInfo = await getInodeInfo(destPath);
    
    const mbps = (sourceInfo.size / 1024 / 1024) / (duration / 1000);
    
    console.log(`  ✅ Copy completed in ${duration}ms`);
    console.log(`  Source inode: ${sourceInfo.inode}`);
    console.log(`  Dest inode:   ${destInfo.inode} (different)`);
    console.log(`  Throughput:   ${mbps.toFixed(2)} MB/s`);
    
    return { success: true, duration, strategy: 'copy', mbps };
  } catch (error) {
    console.log(`  ❌ Copy failed: ${error.message}`);
    return { success: false, error: error.message, strategy: 'copy' };
  }
}

/**
 * Test atomic copy (temp + rename)
 */
async function testAtomicCopy(sourcePath, destPath) {
  console.log(`\n🧪 Testing atomic copy (temp + rename)...`);
  console.log(`  Source: ${sourcePath}`);
  console.log(`  Dest:   ${destPath}`);
  
  const tempPath = `${destPath}.tmp.${process.pid}.${Date.now()}`;
  
  try {
    const startTime = Date.now();
    
    // Step 1: Copy to temp file
    console.log(`  Step 1: Copying to temp file...`);
    await fs.copyFile(sourcePath, tempPath);
    
    // Step 2: Atomic rename
    console.log(`  Step 2: Atomic rename...`);
    await fs.rename(tempPath, destPath);
    
    const duration = Date.now() - startTime;
    
    console.log(`  ✅ Atomic copy completed in ${duration}ms`);
    
    return { success: true, duration, strategy: 'atomic-copy' };
  } catch (error) {
    // Cleanup temp file on failure
    try {
      await fs.unlink(tempPath);
    } catch {}
    
    console.log(`  ❌ Atomic copy failed: ${error.message}`);
    return { success: false, error: error.message, strategy: 'atomic-copy' };
  }
}

// ============================================================================
// SECTION 3: STRATEGY DETERMINATION
// ============================================================================

/**
 * Determine the best copy strategy for given paths
 */
async function determineBestStrategy(sourcePath, destPath) {
  console.log(`\n🎯 Determining best copy strategy...`);
  console.log(`  Source: ${sourcePath}`);
  console.log(`  Dest:   ${destPath}`);
  
  const strategies = [];
  
  // Check if same device (hardlink possible)
  const sameDevice = await isSameDevice(sourcePath, path.dirname(destPath));
  
  if (sameDevice) {
    strategies.push('hardlink');
    console.log(`  ✅ Hardlink supported (same device)`);
  } else {
    console.log(`  ⚠️  Hardlink not supported (different devices)`);
  }
  
  // Check if reflink supported (APFS/Btrfs)
  if (process.platform === 'darwin') {
    console.log(`  ✅ Reflink may be supported (macOS APFS)`);
    strategies.push('reflink');
  } else if (process.platform === 'linux') {
    // Check filesystem type
    try {
      const { stdout } = await execAsync(`df -T "${path.dirname(destPath)}" | tail -1`);
      if (stdout.includes('btrfs') || stdout.includes('xfs')) {
        console.log(`  ✅ Reflink supported (Btrfs/XFS filesystem)`);
        strategies.push('reflink');
      } else {
        console.log(`  ⚠️  Reflink not supported (filesystem doesn't support CoW)`);
      }
    } catch {
      console.log(`  ❓ Could not determine filesystem type`);
    }
  }
  
  // Copy is always available as fallback
  strategies.push('copy');
  console.log(`  ✅ Regular copy always available (fallback)`);
  
  console.log(`\n📊 Recommended strategy order:`);
  strategies.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  
  return strategies;
}

// ============================================================================
// SECTION 4: LIVE MONITORING
// ============================================================================

/**
 * Monitor file operations in real-time
 */
class FileOperationMonitor {
  constructor() {
    this.operations = [];
  }
  
  async monitorOperation(name, fn) {
    const startTime = Date.now();
    const startMem = process.memoryUsage().heapUsed;
    
    console.log(`\n⏱️  Starting: ${name}`);
    
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      const endMem = process.memoryUsage().heapUsed;
      const memDelta = endMem - startMem;
      
      const op = {
        name,
        success: true,
        duration,
        memoryUsed: memDelta,
        timestamp: new Date().toISOString(),
        ...result,
      };
      
      this.operations.push(op);
      
      console.log(`✅ Completed: ${name} in ${duration}ms (mem: ${(memDelta / 1024 / 1024).toFixed(2)}MB)`);
      
      return op;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      const op = {
        name,
        success: false,
        duration,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
      
      this.operations.push(op);
      
      console.log(`❌ Failed: ${name} after ${duration}ms - ${error.message}`);
      
      throw error;
    }
  }
  
  getSummary() {
    console.log(`\n📊 OPERATION SUMMARY`);
    console.log(`${'='.repeat(80)}`);
    
    for (const op of this.operations) {
      console.log(`\n${op.success ? '✅' : '❌'} ${op.name}`);
      console.log(`   Duration: ${op.duration}ms`);
      if (op.strategy) console.log(`   Strategy: ${op.strategy}`);
      if (op.mbps) console.log(`   Throughput: ${op.mbps.toFixed(2)} MB/s`);
      if (op.memoryUsed) console.log(`   Memory: ${(op.memoryUsed / 1024 / 1024).toFixed(2)}MB`);
      if (op.error) console.log(`   Error: ${op.error}`);
    }
    
    const successful = this.operations.filter(op => op.success).length;
    const total = this.operations.length;
    
    console.log(`\n📈 Total: ${successful}/${total} successful`);
  }
}

// ============================================================================
// SECTION 5: CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command) {
    console.log(`
📁 File Operation Monitor & Tester

Usage:
  node file-ops-monitor.js check <file1> <file2>
    Check if two files are hardlinked
  
  node file-ops-monitor.js compare <file1> <file2>
    Compare file stats side-by-side
  
  node file-ops-monitor.js test-hardlink <source> <dest>
    Test creating a hardlink
  
  node file-ops-monitor.js test-reflink <source> <dest>
    Test creating a reflink (copy-on-write)
  
  node file-ops-monitor.js test-copy <source> <dest>
    Test regular file copy
  
  node file-ops-monitor.js test-all <source> <dest>
    Test all strategies and compare
  
  node file-ops-monitor.js strategy <source> <dest>
    Determine best copy strategy
  
  node file-ops-monitor.js device <path1> <path2>
    Check if paths are on same device

Examples:
  node file-ops-monitor.js check ./source.jpg ./archive.jpg
  node file-ops-monitor.js test-all ./test.jpg ./output.jpg
  node file-ops-monitor.js strategy /Volumes/Camera/IMG_1234.jpg /archive/abc123.jpg
    `);
    process.exit(0);
  }
  
  const monitor = new FileOperationMonitor();
  
  try {
    switch (command) {
      case 'check':
        await areHardlinked(args[1], args[2]);
        break;
        
      case 'compare':
        await compareFiles(args[1], args[2]);
        break;
        
      case 'device':
        await isSameDevice(args[1], args[2]);
        break;
        
      case 'test-hardlink':
        await monitor.monitorOperation('hardlink', () => 
          testHardlink(args[1], args[2])
        );
        break;
        
      case 'test-reflink':
        await monitor.monitorOperation('reflink', () => 
          testReflink(args[1], args[2])
        );
        break;
        
      case 'test-copy':
        await monitor.monitorOperation('copy', () => 
          testCopy(args[1], args[2])
        );
        break;
        
      case 'test-atomic':
        await monitor.monitorOperation('atomic-copy', () => 
          testAtomicCopy(args[1], args[2])
        );
        break;
        
      case 'test-all':
        console.log(`\n${'='.repeat(80)}`);
        console.log(`COMPREHENSIVE COPY STRATEGY TEST`);
        console.log(`${'='.repeat(80)}`);
        
        const testFile = args[1];
        const baseDir = path.dirname(args[2]);
        
        // Test hardlink
        const hlDest = path.join(baseDir, 'test-hardlink.tmp');
        try {
          await monitor.monitorOperation('hardlink', () => testHardlink(testFile, hlDest));
          await fs.unlink(hlDest);
        } catch {}
        
        // Test reflink
        const rlDest = path.join(baseDir, 'test-reflink.tmp');
        try {
          await monitor.monitorOperation('reflink', () => testReflink(testFile, rlDest));
          await fs.unlink(rlDest);
        } catch {}
        
        // Test copy
        const cpDest = path.join(baseDir, 'test-copy.tmp');
        try {
          await monitor.monitorOperation('copy', () => testCopy(testFile, cpDest));
          await fs.unlink(cpDest);
        } catch {}
        
        // Test atomic copy
        const acDest = path.join(baseDir, 'test-atomic.tmp');
        try {
          await monitor.monitorOperation('atomic-copy', () => testAtomicCopy(testFile, acDest));
          await fs.unlink(acDest);
        } catch {}
        
        monitor.getSummary();
        break;
        
      case 'strategy':
        await determineBestStrategy(args[1], args[2]);
        break;
        
      default:
        console.log(`❌ Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  isSameDevice,
  getInodeInfo,
  areHardlinked,
  compareFiles,
  testHardlink,
  testReflink,
  testCopy,
  testAtomicCopy,
  determineBestStrategy,
  FileOperationMonitor,
};
