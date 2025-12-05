/**
 * Import System v2.0 IPC Handlers
 *
 * Per Import Spec v2.0:
 * - import:v2:start - Start new import with 5-step pipeline
 * - import:v2:cancel - Cancel running import
 * - import:v2:status - Get current import status
 * - import:v2:resume - Resume incomplete import
 * - jobs:status - Get background job queue status
 * - jobs:retry - Retry failed job from dead letter queue
 *
 * @module main/ipc-handlers/import-v2
 */

import { ipcMain, BrowserWindow } from 'electron';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '../database.types';
import {
  createImportOrchestrator,
  type ImportOrchestrator,
  type ImportProgress,
  type ImportResult,
} from '../../services/import';
import { getJobWorkerService, startJobWorker, stopJobWorker } from '../../services/job-worker-service';
import { JobQueue, IMPORT_QUEUES } from '../../services/job-queue';
import { getCurrentUser } from '../../services/user-service';

// Singleton orchestrator instance
let orchestrator: ImportOrchestrator | null = null;

// Track active import abort controllers
const activeImports = new Map<string, AbortController>();

/**
 * Get the main browser window for sending events
 */
function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0] : null;
}

/**
 * Send event to renderer
 */
function sendToRenderer(channel: string, data: unknown): void {
  const window = getMainWindow();
  if (window && !window.isDestroyed()) {
    window.webContents.send(channel, data);
  }
}

/**
 * Register Import v2.0 IPC handlers
 */
export function registerImportV2Handlers(db: Kysely<Database>): void {
  // Validation schemas
  const ImportStartSchema = z.object({
    paths: z.array(z.string()),
    locid: z.string().uuid(),
    loc12: z.string(),
    address_state: z.string().nullable(),
    type: z.string().nullable(),
    slocnam: z.string().nullable(),
  });

  const JobRetrySchema = z.object({
    deadLetterId: z.number(),
  });

  /**
   * Start a new import using v2 pipeline
   */
  ipcMain.handle('import:v2:start', async (_event, input: unknown) => {
    try {
      const validated = ImportStartSchema.parse(input);

      // Get archive path from settings
      const archiveSetting = await db
        .selectFrom('settings')
        .select('value')
        .where('key', '=', 'archive_folder')
        .executeTakeFirst();

      if (!archiveSetting?.value) {
        throw new Error('Archive folder not configured. Please set it in Settings.');
      }

      const archivePath = archiveSetting.value;

      // Get current user for activity tracking
      const currentUser = await getCurrentUser(db);

      // Create orchestrator if not exists
      if (!orchestrator) {
        orchestrator = createImportOrchestrator(db, archivePath);
      }

      // Create abort controller
      const abortController = new AbortController();

      // Progress callback sends events to renderer
      const onProgress = (progress: ImportProgress) => {
        sendToRenderer('import:v2:progress', progress);
        activeImports.set(progress.sessionId, abortController);
      };

      // Start import
      const result = await orchestrator.import(validated.paths, {
        location: {
          locid: validated.locid,
          loc12: validated.loc12,
          address_state: validated.address_state,
          type: validated.type,
          slocnam: validated.slocnam,
        },
        archivePath,
        user: currentUser ? {
          userId: currentUser.userId,
          username: currentUser.username,
        } : undefined,
        onProgress,
        signal: abortController.signal,
      });

      // Clean up
      activeImports.delete(result.sessionId);

      // Send completion event
      sendToRenderer('import:v2:complete', {
        sessionId: result.sessionId,
        status: result.status,
        totalImported: result.finalizationResult?.totalFinalized ?? 0,
        totalDuplicates: result.hashResult?.totalDuplicates ?? 0,
        totalErrors: result.finalizationResult?.totalErrors ?? 0,
        totalDurationMs: result.totalDurationMs,
        jobsQueued: result.finalizationResult?.jobsQueued ?? 0,
      });

      return result;

    } catch (error) {
      console.error('[import:v2:start] Error:', error);
      throw error;
    }
  });

  /**
   * Cancel running import
   */
  ipcMain.handle('import:v2:cancel', async (_event, sessionId: string) => {
    const abortController = activeImports.get(sessionId);
    if (abortController) {
      abortController.abort();
      activeImports.delete(sessionId);
      return { cancelled: true };
    }

    // Also try to cancel via orchestrator
    if (orchestrator) {
      orchestrator.cancel();
      return { cancelled: true };
    }

    return { cancelled: false, reason: 'No active import found' };
  });

  /**
   * Get current import status
   */
  ipcMain.handle('import:v2:status', async () => {
    if (!orchestrator) {
      return { sessionId: null, status: 'idle' };
    }
    return orchestrator.getStatus();
  });

  /**
   * Get resumable import sessions
   */
  ipcMain.handle('import:v2:resumable', async () => {
    if (!orchestrator) {
      // Create temporary orchestrator to query DB
      const archiveSetting = await db
        .selectFrom('settings')
        .select('value')
        .where('key', '=', 'archive_folder')
        .executeTakeFirst();

      if (!archiveSetting?.value) {
        return [];
      }

      const tempOrchestrator = createImportOrchestrator(db, archiveSetting.value);
      return tempOrchestrator.getResumableSessions();
    }

    return orchestrator.getResumableSessions();
  });

  /**
   * Resume an incomplete import
   */
  ipcMain.handle('import:v2:resume', async (_event, sessionId: string) => {
    if (!orchestrator) {
      throw new Error('Import system not initialized');
    }

    // Get session info to rebuild location
    const session = await db
      .selectFrom('import_sessions')
      .selectAll()
      .where('session_id', '=', sessionId)
      .executeTakeFirst();

    if (!session) {
      throw new Error('Session not found');
    }

    // Get location info
    const location = await db
      .selectFrom('locs')
      .select(['locid', 'loc12', 'address_state', 'type', 'slocnam'])
      .where('locid', '=', session.locid)
      .executeTakeFirst();

    if (!location) {
      throw new Error('Location not found');
    }

    const archiveSetting = await db
      .selectFrom('settings')
      .select('value')
      .where('key', '=', 'archive_folder')
      .executeTakeFirst();

    if (!archiveSetting?.value) {
      throw new Error('Archive folder not configured');
    }

    const currentUser = await getCurrentUser(db);

    const abortController = new AbortController();
    const onProgress = (progress: ImportProgress) => {
      sendToRenderer('import:v2:progress', progress);
      activeImports.set(progress.sessionId, abortController);
    };

    const result = await orchestrator.resume(sessionId, {
      location: {
        locid: location.locid,
        loc12: location.loc12,
        address_state: location.address_state,
        type: location.type,
        slocnam: location.slocnam,
      },
      archivePath: archiveSetting.value,
      user: currentUser ? {
        userId: currentUser.userId,
        username: currentUser.username,
      } : undefined,
      onProgress,
      signal: abortController.signal,
    });

    return result;
  });

  /**
   * Get job queue statistics
   */
  ipcMain.handle('jobs:status', async () => {
    const workerService = getJobWorkerService(db);
    return workerService.getStats();
  });

  /**
   * Get dead letter queue entries
   */
  ipcMain.handle('jobs:deadLetter', async (_event, queue?: string) => {
    const jobQueue = new JobQueue(db);
    return jobQueue.getDeadLetterQueue(queue);
  });

  /**
   * Retry a job from dead letter queue
   */
  ipcMain.handle('jobs:retry', async (_event, input: unknown) => {
    const validated = JobRetrySchema.parse(input);
    const jobQueue = new JobQueue(db);

    const newJobId = await jobQueue.retryDeadLetter(validated.deadLetterId);
    return { success: newJobId !== null, newJobId };
  });

  /**
   * Acknowledge (dismiss) dead letter entries
   */
  ipcMain.handle('jobs:acknowledge', async (_event, ids: number[]) => {
    const jobQueue = new JobQueue(db);
    await jobQueue.acknowledgeDeadLetter(ids);
    return { acknowledged: ids.length };
  });

  /**
   * Clear old completed jobs
   */
  ipcMain.handle('jobs:clearCompleted', async (_event, olderThanMs?: number) => {
    const jobQueue = new JobQueue(db);
    const cleared = await jobQueue.clearCompleted(olderThanMs);
    return { cleared };
  });

  console.log('[IPC] Import v2.0 handlers registered');
}

/**
 * Start the job worker service
 */
export function initializeJobWorker(db: Kysely<Database>): void {
  const workerService = startJobWorker(db);

  // Forward worker events to renderer
  workerService.on('asset:thumbnail-ready', (data) => {
    sendToRenderer('asset:thumbnail-ready', data);
  });

  workerService.on('asset:metadata-complete', (data) => {
    sendToRenderer('asset:metadata-complete', data);
  });

  workerService.on('asset:proxy-ready', (data) => {
    sendToRenderer('asset:proxy-ready', data);
  });

  workerService.on('job:progress', (data) => {
    sendToRenderer('jobs:progress', data);
  });

  console.log('[JobWorker] Background job processor initialized');
}

/**
 * Shutdown job worker service
 */
export async function shutdownJobWorker(): Promise<void> {
  await stopJobWorker();
  console.log('[JobWorker] Shutdown complete');
}
