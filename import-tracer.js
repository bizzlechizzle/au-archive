/**
 * REAL-TIME IMPORT TRACER
 * 
 * Drop-in utility to wrap your import operations and get detailed visibility
 * Shows exactly what's happening: hardlink vs copy, timing, throughput, errors
 * 
 * Usage:
 *   const tracer = new ImportTracer('my-import-session');
 *   
 *   await tracer.traceFile(filePath, async () => {
 *     await copyFile(source, dest);
 *   });
 *   
 *   tracer.printReport();
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class ImportTracer extends EventEmitter {
  constructor(sessionId, options = {}) {
    super();
    
    this.sessionId = sessionId;
    this.options = {
      logToConsole: options.logToConsole !== false,
      logToFile: options.logToFile || null,
      emitEvents: options.emitEvents !== false,
      ...options,
    };
    
    this.operations = [];
    this.startTime = Date.now();
    this.currentPhase = null;
    this.errors = [];
  }
  
  // ============================================================================
  // PHASE TRACKING
  // ============================================================================
  
  startPhase(name, metadata = {}) {
    this.currentPhase = {
      name,
      startTime: Date.now(),
      operations: [],
      metadata,
    };
    
    this.log('phase.start', { phase: name, ...metadata });
    this.emit('phase:start', this.currentPhase);
  }
  
  endPhase() {
    if (!this.currentPhase) return;
    
    this.currentPhase.endTime = Date.now();
    this.currentPhase.duration = this.currentPhase.endTime - this.currentPhase.startTime;
    
    this.log('phase.end', {
      phase: this.currentPhase.name,
      duration: this.currentPhase.duration,
      operations: this.currentPhase.operations.length,
    });
    
    this.emit('phase:end', this.currentPhase);
    
    this.operations.push(...this.currentPhase.operations);
    this.currentPhase = null;
  }
  
  // ============================================================================
  // FILE OPERATION TRACKING
  // ============================================================================
  
  async traceFile(filePath, operation, metadata = {}) {
    const op = {
      type: 'file',
      filePath,
      startTime: Date.now(),
      metadata,
    };
    
    // Get file info before operation
    try {
      const stats = await fs.stat(filePath);
      op.size = stats.size;
      op.inode = stats.ino;
      op.nlink = stats.nlink;
    } catch (error) {
      op.error = `Failed to stat file: ${error.message}`;
    }
    
    this.log('file.start', { 
      file: path.basename(filePath),
      size: op.size,
      ...metadata,
    });
    
    try {
      const result = await operation();
      
      op.endTime = Date.now();
      op.duration = op.endTime - op.startTime;
      op.success = true;
      op.result = result;
      
      // Calculate throughput
      if (op.size) {
        op.mbps = (op.size / 1024 / 1024) / (op.duration / 1000);
      }
      
      this.log('file.complete', {
        file: path.basename(filePath),
        duration: op.duration,
        mbps: op.mbps?.toFixed(2),
        ...metadata,
      });
      
      this.emit('file:complete', op);
      
    } catch (error) {
      op.endTime = Date.now();
      op.duration = op.endTime - op.startTime;
      op.success = false;
      op.error = error.message;
      op.stack = error.stack;
      
      this.log('file.error', {
        file: path.basename(filePath),
        error: error.message,
        ...metadata,
      });
      
      this.errors.push(op);
      this.emit('file:error', op);
      
      throw error;
    } finally {
      if (this.currentPhase) {
        this.currentPhase.operations.push(op);
      } else {
        this.operations.push(op);
      }
    }
  }
  
  async traceCopyStrategy(sourcePath, destPath) {
    const op = {
      type: 'copy',
      sourcePath,
      destPath,
      startTime: Date.now(),
    };
    
    try {
      // Get source info
      const sourceStats = await fs.stat(sourcePath);
      op.size = sourceStats.size;
      op.sourceInode = sourceStats.ino;
      op.sourceDev = sourceStats.dev;
      
      // Get dest directory info
      const destDirStats = await fs.stat(path.dirname(destPath));
      op.destDev = destDirStats.dev;
      
      // Determine strategy
      const sameDevice = sourceStats.dev === destDirStats.dev;
      op.sameDevice = sameDevice;
      
      if (sameDevice) {
        op.strategy = 'hardlink';
        this.log('copy.strategy', {
          strategy: 'hardlink',
          reason: 'same device',
          file: path.basename(sourcePath),
        });
      } else {
        op.strategy = 'copy';
        this.log('copy.strategy', {
          strategy: 'copy',
          reason: 'different devices',
          sourceDevice: op.sourceDev,
          destDevice: op.destDev,
          file: path.basename(sourcePath),
        });
      }
      
      this.emit('copy:strategy', op);
      return op.strategy;
      
    } catch (error) {
      this.log('copy.strategy.error', {
        error: error.message,
        file: path.basename(sourcePath),
      });
      
      return 'copy'; // Fallback to copy
    }
  }
  
  async verifyHardlink(file1, file2) {
    const op = {
      type: 'verify',
      file1,
      file2,
      startTime: Date.now(),
    };
    
    try {
      const stats1 = await fs.stat(file1);
      const stats2 = await fs.stat(file2);
      
      const isHardlinked = stats1.ino === stats2.ino && stats1.dev === stats2.dev;
      
      op.isHardlinked = isHardlinked;
      op.inode1 = stats1.ino;
      op.inode2 = stats2.ino;
      op.success = true;
      
      this.log('verify.hardlink', {
        file1: path.basename(file1),
        file2: path.basename(file2),
        hardlinked: isHardlinked,
        inode1: stats1.ino,
        inode2: stats2.ino,
      });
      
      this.emit('verify:complete', op);
      return isHardlinked;
      
    } catch (error) {
      op.error = error.message;
      op.success = false;
      
      this.log('verify.error', {
        error: error.message,
      });
      
      this.emit('verify:error', op);
      return false;
    }
  }
  
  // ============================================================================
  // PROGRESS TRACKING
  // ============================================================================
  
  updateProgress(current, total, phase = null) {
    const percent = total > 0 ? (current / total) * 100 : 0;
    const elapsed = Date.now() - this.startTime;
    const rate = current / (elapsed / 1000);
    const remaining = total - current;
    const eta = remaining / rate;
    
    const progress = {
      phase: phase || this.currentPhase?.name || 'unknown',
      current,
      total,
      percent: percent.toFixed(1),
      elapsed,
      rate: rate.toFixed(2),
      eta: isFinite(eta) ? eta.toFixed(0) : null,
    };
    
    this.log('progress.update', progress);
    this.emit('progress', progress);
    
    return progress;
  }
  
  // ============================================================================
  // LOGGING
  // ============================================================================
  
  log(event, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      event,
      ...data,
    };
    
    if (this.options.logToConsole) {
      this.logToConsole(entry);
    }
    
    if (this.options.logToFile) {
      this.logToFile(entry);
    }
    
    if (this.options.emitEvents) {
      this.emit('log', entry);
    }
  }
  
  logToConsole(entry) {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const emoji = this.getEmoji(entry.event);
    
    // Format based on event type
    switch (entry.event) {
      case 'phase.start':
        console.log(`\n${emoji} [${time}] Starting phase: ${entry.phase}`);
        break;
        
      case 'phase.end':
        console.log(`${emoji} [${time}] Completed phase: ${entry.phase} (${entry.duration}ms, ${entry.operations} ops)`);
        break;
        
      case 'file.start':
        console.log(`  ${emoji} Processing: ${entry.file} (${this.formatBytes(entry.size)})`);
        break;
        
      case 'file.complete':
        const throughput = entry.mbps ? ` @ ${entry.mbps} MB/s` : '';
        console.log(`  ${emoji} Completed: ${entry.file} (${entry.duration}ms${throughput})`);
        break;
        
      case 'file.error':
        console.log(`  ${emoji} Failed: ${entry.file} - ${entry.error}`);
        break;
        
      case 'copy.strategy':
        console.log(`  ${emoji} Strategy: ${entry.strategy} (${entry.reason})`);
        break;
        
      case 'verify.hardlink':
        const status = entry.hardlinked ? 'HARDLINKED' : 'SEPARATE';
        console.log(`  ${emoji} Verify: ${status} (inodes: ${entry.inode1}, ${entry.inode2})`);
        break;
        
      case 'progress.update':
        process.stdout.write(`\r  📊 Progress: ${entry.percent}% (${entry.current}/${entry.total}) | Rate: ${entry.rate}/s | ETA: ${entry.eta}s  `);
        break;
        
      default:
        console.log(`  [${time}] ${entry.event}:`, JSON.stringify(entry, null, 2));
    }
  }
  
  async logToFile(entry) {
    if (!this.options.logToFile) return;
    
    try {
      const line = JSON.stringify(entry) + '\n';
      await fs.appendFile(this.options.logToFile, line);
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }
  
  getEmoji(event) {
    const emojis = {
      'phase.start': '🚀',
      'phase.end': '✅',
      'file.start': '📄',
      'file.complete': '✅',
      'file.error': '❌',
      'copy.strategy': '🎯',
      'verify.hardlink': '🔗',
      'verify.error': '❌',
      'progress.update': '📊',
    };
    return emojis[event] || '•';
  }
  
  // ============================================================================
  // REPORTING
  // ============================================================================
  
  getStats() {
    const successful = this.operations.filter(op => op.success).length;
    const failed = this.operations.filter(op => !op.success).length;
    const totalDuration = this.operations.reduce((sum, op) => sum + (op.duration || 0), 0);
    const totalSize = this.operations.reduce((sum, op) => sum + (op.size || 0), 0);
    const avgDuration = successful > 0 ? totalDuration / successful : 0;
    const totalMbps = totalSize / (totalDuration / 1000) / 1024 / 1024;
    
    return {
      sessionId: this.sessionId,
      totalOperations: this.operations.length,
      successful,
      failed,
      totalDuration,
      avgDuration: avgDuration.toFixed(2),
      totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      overallThroughput: totalMbps.toFixed(2),
      errors: this.errors.length,
    };
  }
  
  printReport() {
    const stats = this.getStats();
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`IMPORT TRACER REPORT - Session: ${this.sessionId}`);
    console.log(`${'='.repeat(80)}`);
    
    console.log(`\n📊 Overall Statistics:`);
    console.log(`  Total operations:    ${stats.totalOperations}`);
    console.log(`  Successful:          ${stats.successful} ✅`);
    console.log(`  Failed:              ${stats.failed} ❌`);
    console.log(`  Total size:          ${stats.totalSizeMB} MB`);
    console.log(`  Total duration:      ${stats.totalDuration}ms`);
    console.log(`  Average per file:    ${stats.avgDuration}ms`);
    console.log(`  Overall throughput:  ${stats.overallThroughput} MB/s`);
    
    // Strategy breakdown
    const strategies = {};
    this.operations.forEach(op => {
      if (op.metadata?.strategy) {
        strategies[op.metadata.strategy] = (strategies[op.metadata.strategy] || 0) + 1;
      }
    });
    
    if (Object.keys(strategies).length > 0) {
      console.log(`\n🎯 Strategy Breakdown:`);
      Object.entries(strategies).forEach(([strategy, count]) => {
        console.log(`  ${strategy}: ${count} files`);
      });
    }
    
    // Error summary
    if (this.errors.length > 0) {
      console.log(`\n❌ Errors (${this.errors.length}):`);
      this.errors.slice(0, 10).forEach((err, i) => {
        console.log(`  ${i + 1}. ${path.basename(err.filePath)}: ${err.error}`);
      });
      if (this.errors.length > 10) {
        console.log(`  ... and ${this.errors.length - 10} more`);
      }
    }
    
    // Slowest operations
    const slowest = [...this.operations]
      .filter(op => op.success && op.duration)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5);
    
    if (slowest.length > 0) {
      console.log(`\n🐌 Slowest Operations:`);
      slowest.forEach((op, i) => {
        const throughput = op.mbps ? ` (${op.mbps.toFixed(2)} MB/s)` : '';
        console.log(`  ${i + 1}. ${path.basename(op.filePath)}: ${op.duration}ms${throughput}`);
      });
    }
    
    console.log(`\n${'='.repeat(80)}\n`);
  }
  
  // ============================================================================
  // UTILITIES
  // ============================================================================
  
  formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }
  
  exportJSON() {
    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      endTime: Date.now(),
      stats: this.getStats(),
      operations: this.operations,
      errors: this.errors,
    };
  }
  
  async saveReport(filePath) {
    const report = this.exportJSON();
    await fs.writeFile(filePath, JSON.stringify(report, null, 2));
    console.log(`\n💾 Report saved to: ${filePath}`);
  }
}

// ============================================================================
// EXAMPLE USAGE
// ============================================================================

async function exampleUsage() {
  const tracer = new ImportTracer('example-session', {
    logToConsole: true,
    logToFile: './import-trace.log',
  });
  
  // Listen to events for real-time updates
  tracer.on('progress', (progress) => {
    // Update UI with progress
  });
  
  tracer.on('file:error', (error) => {
    // Handle error in UI
  });
  
  // Start scanning phase
  tracer.startPhase('scan', { sourcePath: '/Volumes/Camera/DCIM' });
  
  // Trace file operations
  const files = ['file1.jpg', 'file2.jpg', 'file3.jpg'];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    await tracer.traceFile(file, async () => {
      // Your actual file operation here
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    tracer.updateProgress(i + 1, files.length);
  }
  
  tracer.endPhase();
  
  // Start copy phase
  tracer.startPhase('copy');
  
  for (const file of files) {
    // Determine copy strategy
    const strategy = await tracer.traceCopyStrategy(
      `/source/${file}`,
      `/dest/${file}`
    );
    
    await tracer.traceFile(file, async () => {
      // Your actual copy operation
      await new Promise(resolve => setTimeout(resolve, 200));
    }, { strategy });
    
    // Verify if hardlink was used
    if (strategy === 'hardlink') {
      await tracer.verifyHardlink(`/source/${file}`, `/dest/${file}`);
    }
  }
  
  tracer.endPhase();
  
  // Print final report
  tracer.printReport();
  
  // Save detailed JSON report
  await tracer.saveReport('./import-report.json');
}

module.exports = { ImportTracer, exampleUsage };

// Run example if executed directly
if (require.main === module) {
  exampleUsage().catch(console.error);
}
