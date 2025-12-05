/**
 * Job Queue Unit Tests
 * Tests for exponential backoff, job lifecycle, and dead letter queue
 *
 * @module __tests__/unit/job-queue.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JobQueue, IMPORT_QUEUES, JOB_PRIORITY, type JobStatus } from '../../services/job-queue';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import type { Database as DbType } from '../../main/database.types';

describe('JobQueue', () => {
  let sqlite: Database.Database;
  let db: Kysely<DbType>;
  let jobQueue: JobQueue;

  beforeEach(() => {
    // Create in-memory database
    sqlite = new Database(':memory:');

    // Create required tables
    sqlite.exec(`
      CREATE TABLE jobs (
        job_id TEXT PRIMARY KEY,
        queue TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 10,
        status TEXT NOT NULL DEFAULT 'pending',
        payload TEXT NOT NULL,
        depends_on TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        error TEXT,
        result TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        locked_by TEXT,
        locked_at TEXT,
        retry_after TEXT,
        last_error TEXT
      );

      CREATE TABLE job_dead_letter (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        queue TEXT NOT NULL,
        payload TEXT NOT NULL,
        error TEXT,
        attempts INTEGER NOT NULL,
        failed_at TEXT NOT NULL,
        acknowledged INTEGER NOT NULL DEFAULT 0
      );
    `);

    db = new Kysely<DbType>({
      dialect: new SqliteDialect({ database: sqlite }),
    });

    jobQueue = new JobQueue(db, { workerId: 'test-worker' });
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('addJob', () => {
    it('should add a job to the queue', async () => {
      const jobId = await jobQueue.addJob({
        queue: IMPORT_QUEUES.EXIFTOOL,
        payload: { hash: 'abc123' },
      });

      expect(jobId).toBeDefined();
      expect(jobId).toHaveLength(36); // UUID format

      const job = await jobQueue.getJob(jobId);
      expect(job).not.toBeNull();
      expect(job?.queue).toBe(IMPORT_QUEUES.EXIFTOOL);
      expect(job?.status).toBe('pending');
    });

    it('should apply default priority of 10', async () => {
      const jobId = await jobQueue.addJob({
        queue: IMPORT_QUEUES.THUMBNAIL,
        payload: { test: true },
      });

      const job = await jobQueue.getJob(jobId);
      expect(job?.priority).toBe(10);
    });

    it('should apply custom priority', async () => {
      const jobId = await jobQueue.addJob({
        queue: IMPORT_QUEUES.EXIFTOOL,
        payload: { test: true },
        priority: JOB_PRIORITY.CRITICAL,
      });

      const job = await jobQueue.getJob(jobId);
      expect(job?.priority).toBe(100);
    });
  });

  describe('addBulk', () => {
    it('should add multiple jobs in one call', async () => {
      const jobIds = await jobQueue.addBulk([
        { queue: IMPORT_QUEUES.EXIFTOOL, payload: { id: 1 } },
        { queue: IMPORT_QUEUES.EXIFTOOL, payload: { id: 2 } },
        { queue: IMPORT_QUEUES.EXIFTOOL, payload: { id: 3 } },
      ]);

      expect(jobIds).toHaveLength(3);

      const stats = await jobQueue.getStats(IMPORT_QUEUES.EXIFTOOL);
      expect(stats.pending).toBe(3);
    });
  });

  describe('getNext', () => {
    it('should return next available job ordered by priority', async () => {
      await jobQueue.addJob({
        queue: 'test',
        payload: { name: 'low' },
        priority: JOB_PRIORITY.LOW,
      });
      await jobQueue.addJob({
        queue: 'test',
        payload: { name: 'high' },
        priority: JOB_PRIORITY.HIGH,
      });

      const job = await jobQueue.getNext('test');
      expect(job?.payload).toEqual({ name: 'high' });
    });

    it('should not return job if dependency is not completed', async () => {
      const parentId = await jobQueue.addJob({
        queue: 'test',
        payload: { parent: true },
      });

      await jobQueue.addJob({
        queue: 'test',
        payload: { child: true },
        dependsOn: parentId,
      });

      const job = await jobQueue.getNext('test');
      expect(job?.payload).toEqual({ parent: true });
    });

    it('should return dependent job after parent completes', async () => {
      const parentId = await jobQueue.addJob({
        queue: 'test',
        payload: { parent: true },
      });

      await jobQueue.addJob({
        queue: 'test',
        payload: { child: true },
        dependsOn: parentId,
      });

      // Process and complete parent
      const parentJob = await jobQueue.getNext('test');
      await jobQueue.complete(parentJob!.jobId);

      // Now child should be available
      const childJob = await jobQueue.getNext('test');
      expect(childJob?.payload).toEqual({ child: true });
    });
  });

  describe('exponential backoff (FIX 2)', () => {
    it('should calculate exponential backoff delay', () => {
      expect(jobQueue.calculateRetryDelay(0)).toBe(1000);   // 1s
      expect(jobQueue.calculateRetryDelay(1)).toBe(2000);   // 2s
      expect(jobQueue.calculateRetryDelay(2)).toBe(4000);   // 4s
      expect(jobQueue.calculateRetryDelay(3)).toBe(8000);   // 8s
      expect(jobQueue.calculateRetryDelay(4)).toBe(16000);  // 16s
      expect(jobQueue.calculateRetryDelay(5)).toBe(32000);  // 32s
      expect(jobQueue.calculateRetryDelay(6)).toBe(60000);  // Capped at 60s
      expect(jobQueue.calculateRetryDelay(10)).toBe(60000); // Still capped
    });

    it('should set retry_after when job fails', async () => {
      const jobId = await jobQueue.addJob({
        queue: 'test',
        payload: {},
      });

      // Get and fail the job
      const job = await jobQueue.getNext('test');
      await jobQueue.fail(jobId, 'Test error');

      // Check retry_after is set
      const row = sqlite.prepare('SELECT retry_after, last_error, status FROM jobs WHERE job_id = ?').get(jobId) as {
        retry_after: string | null;
        last_error: string | null;
        status: string;
      };

      expect(row.status).toBe('pending'); // Back to pending for retry
      expect(row.retry_after).not.toBeNull();
      expect(row.last_error).toBe('Test error');

      // Verify retry_after is in the future
      const retryAfter = new Date(row.retry_after!);
      expect(retryAfter.getTime()).toBeGreaterThan(Date.now());
    });

    it('should not return job before retry_after time', async () => {
      const jobId = await jobQueue.addJob({
        queue: 'test',
        payload: {},
      });

      // Get, fail, and set retry_after to 1 hour in the future
      await jobQueue.getNext('test');
      await jobQueue.fail(jobId, 'Error');

      // Job should not be available immediately after failure
      const nextJob = await jobQueue.getNext('test');
      expect(nextJob).toBeNull();
    });

    it('should move to dead letter queue after max attempts', async () => {
      const jobId = await jobQueue.addJob({
        queue: 'test',
        payload: { test: true },
        maxAttempts: 1,
      });

      // Get and fail the job
      await jobQueue.getNext('test');
      await jobQueue.fail(jobId, 'Final error');

      // Check job is dead
      const job = await jobQueue.getJob(jobId);
      expect(job?.status).toBe('dead');

      // Check dead letter queue
      const dlq = await jobQueue.getDeadLetterQueue('test');
      expect(dlq).toHaveLength(1);
      expect(dlq[0].error).toBe('Final error');
    });
  });

  describe('complete', () => {
    it('should mark job as completed', async () => {
      const jobId = await jobQueue.addJob({
        queue: 'test',
        payload: {},
      });

      await jobQueue.getNext('test');
      await jobQueue.complete(jobId, { result: 'success' });

      const job = await jobQueue.getJob(jobId);
      expect(job?.status).toBe('completed');
      expect(job?.result).toEqual({ result: 'success' });
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', async () => {
      await jobQueue.addJob({ queue: 'test', payload: {} });
      await jobQueue.addJob({ queue: 'test', payload: {} });
      await jobQueue.addJob({ queue: 'test', payload: {} });

      const stats = await jobQueue.getStats('test');
      expect(stats.pending).toBe(3);
      expect(stats.total).toBe(3);
    });
  });

  describe('dead letter queue', () => {
    it('should acknowledge dead letter entries', async () => {
      const jobId = await jobQueue.addJob({
        queue: 'test',
        payload: {},
        maxAttempts: 1,
      });

      await jobQueue.getNext('test');
      await jobQueue.fail(jobId, 'Error');

      const dlq = await jobQueue.getDeadLetterQueue('test');
      expect(dlq).toHaveLength(1);

      await jobQueue.acknowledgeDeadLetter([dlq[0].id]);

      const afterAck = await jobQueue.getDeadLetterQueue('test');
      expect(afterAck[0].acknowledged).toBe(true);
    });

    it('should retry dead letter job', async () => {
      const jobId = await jobQueue.addJob({
        queue: 'test',
        payload: { retried: false },
        maxAttempts: 1,
      });

      await jobQueue.getNext('test');
      await jobQueue.fail(jobId, 'Error');

      const dlq = await jobQueue.getDeadLetterQueue('test');
      const newJobId = await jobQueue.retryDeadLetter(dlq[0].id);

      expect(newJobId).not.toBeNull();
      expect(newJobId).not.toBe(jobId);

      const newJob = await jobQueue.getJob(newJobId!);
      expect(newJob?.status).toBe('pending');
    });
  });
});
