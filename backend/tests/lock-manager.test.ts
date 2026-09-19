import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProjectLockManager,
  ProjectLockedError,
  defaultProjectLockManager,
} from '../src/core/lock/project-lock-manager.js';

describe('Story 2.2: ProjectLockManager', () => {
  let lockManager: ProjectLockManager;

  beforeEach(() => {
    lockManager = new ProjectLockManager();
    defaultProjectLockManager.clear();
  });

  describe('Basic Lock Acquisition & Release', () => {
    it('acquires lock on an idle project successfully', () => {
      const lock = lockManager.acquire('mbridge', 'task-uuid-1', '3a8f12');

      expect(lock.projectAlias).toBe('mbridge');
      expect(lock.taskId).toBe('task-uuid-1');
      expect(lock.displayId).toBe('3a8f12');
      expect(lock.acquiredAt).toBeDefined();
      expect(lockManager.isLocked('mbridge')).toBe(true);
    });

    it('releases lock when task finishes', () => {
      lockManager.acquire('mbridge', 'task-uuid-1', '3a8f12');
      expect(lockManager.isLocked('mbridge')).toBe(true);

      const released = lockManager.release('mbridge');
      expect(released).toBe(true);
      expect(lockManager.isLocked('mbridge')).toBe(false);
    });

    it('returns false when releasing a project that is not locked', () => {
      expect(lockManager.release('unlocked-proj')).toBe(false);
    });

    it('releases only when taskId matches if taskId is provided', () => {
      lockManager.acquire('mbridge', 'owner-task-id', '3a8f12');

      // Attempt release with wrong taskId
      const wrongRelease = lockManager.release('mbridge', 'different-task-id');
      expect(wrongRelease).toBe(false);
      expect(lockManager.isLocked('mbridge')).toBe(true);

      // Attempt release with correct taskId
      const correctRelease = lockManager.release('mbridge', 'owner-task-id');
      expect(correctRelease).toBe(true);
      expect(lockManager.isLocked('mbridge')).toBe(false);
    });
  });

  describe('Conflict Rejection & 409 Notice', () => {
    it('rejects conflicting task with 409 ProjectLockedError containing exact formatted message', () => {
      lockManager.acquire('mbridge', 'uuid-task-1', '3a8f12');

      try {
        lockManager.acquire('mbridge', 'uuid-task-2', '9b2c3d');
        expect.unreachable('Should have thrown ProjectLockedError');
      } catch (err) {
        expect(err).toBeInstanceOf(ProjectLockedError);
        const lockErr = err as ProjectLockedError;
        expect(lockErr.statusCode).toBe(409);
        expect(lockErr.projectAlias).toBe('mbridge');
        expect(lockErr.taskId).toBe('uuid-task-1');
        expect(lockErr.displayId).toBe('3a8f12');
        expect(lockErr.message).toBe(
          '⚠️ Project "mbridge" is busy running task [3a8f12]. Use /cancel mbridge to abort it first.'
        );
      }
    });

    it('falls back to taskId if displayId is not provided upon lock acquisition', () => {
      lockManager.acquire('mbridge', 'uuid-task-no-display');

      expect(() => lockManager.acquire('mbridge', 'uuid-task-2')).toThrow(
        '⚠️ Project "mbridge" is busy running task [uuid-task-no-display]. Use /cancel mbridge to abort it first.'
      );
    });

    it('tryAcquire returns true on idle and false on busy without throwing', () => {
      expect(lockManager.tryAcquire('mbridge', 'task-1')).toBe(true);
      expect(lockManager.tryAcquire('mbridge', 'task-2')).toBe(false);
      lockManager.release('mbridge');
      expect(lockManager.tryAcquire('mbridge', 'task-2')).toBe(true);
    });
  });

  describe('Case-Insensitive Alias Normalization & Disjoint Concurrency', () => {
    it('normalizes project aliases case-insensitively with whitespace trimming', () => {
      lockManager.acquire('  MBRIDGE  ', 'task-1', '3a8f12');

      expect(lockManager.isLocked('mbridge')).toBe(true);
      expect(lockManager.isLocked('MBridge')).toBe(true);
      expect(lockManager.isLocked('MBRIDGE')).toBe(true);

      // Attempt acquiring under mixed-case should conflict
      expect(() => lockManager.acquire('Mbridge', 'task-2')).toThrow(ProjectLockedError);

      // Release under uppercase
      expect(lockManager.release('MBRIDGE')).toBe(true);
      expect(lockManager.isLocked('mbridge')).toBe(false);
    });

    it('permits commands targeting independent project aliases to acquire locks and run concurrently', () => {
      const lock1 = lockManager.acquire('mbridge', 'task-1', '111111');
      const lock2 = lockManager.acquire('ecommerce', 'task-2', '222222');
      const lock3 = lockManager.acquire('billing-api', 'task-3', '333333');

      expect(lock1.projectAlias).toBe('mbridge');
      expect(lock2.projectAlias).toBe('ecommerce');
      expect(lock3.projectAlias).toBe('billing-api');

      expect(lockManager.getActiveLocks()).toHaveLength(3);

      // Releasing one does not affect others
      lockManager.release('ecommerce');
      expect(lockManager.isLocked('ecommerce')).toBe(false);
      expect(lockManager.isLocked('mbridge')).toBe(true);
      expect(lockManager.isLocked('billing-api')).toBe(true);
    });
  });

  describe('try...finally Guarantee with withLock', () => {
    it('guarantees lock release when action completes successfully', async () => {
      let executed = false;
      const result = await lockManager.withLock('mbridge', 'task-1', '3a8f12', async () => {
        expect(lockManager.isLocked('mbridge')).toBe(true);
        executed = true;
        return 'success';
      });

      expect(executed).toBe(true);
      expect(result).toBe('success');
      expect(lockManager.isLocked('mbridge')).toBe(false);
    });

    it('guarantees lock release when action throws an error', async () => {
      await expect(
        lockManager.withLock('mbridge', 'task-1', '3a8f12', async () => {
          expect(lockManager.isLocked('mbridge')).toBe(true);
          throw new Error('Pipeline execution crashed');
        })
      ).rejects.toThrow('Pipeline execution crashed');

      // Crucial: lock must be released despite uncaught exception
      expect(lockManager.isLocked('mbridge')).toBe(false);
    });
  });

  describe('Input Validation', () => {
    it('rejects empty, whitespace, or invalid projectAlias and taskId', () => {
      expect(() => lockManager.acquire('', 'task-1')).toThrow('projectAlias must not be empty');
      expect(() => lockManager.acquire('   ', 'task-1')).toThrow('projectAlias must not be empty');
      expect(() => lockManager.acquire(null as any, 'task-1')).toThrow('projectAlias must not be empty');

      expect(() => lockManager.acquire('proj', '')).toThrow('taskId must not be empty');
      expect(() => lockManager.acquire('proj', '   ')).toThrow('taskId must not be empty');
      expect(() => lockManager.acquire('proj', null as any)).toThrow('taskId must not be empty');
    });
  });

  describe('I/O & Edge-Case Matrix Scenarios', () => {
    // Scenario 1: Lock Acquisition on Free Project
    it('Matrix Scenario 1: Lock Acquisition on Free Project -> Lock acquired, task proceeds', () => {
      const lock = lockManager.acquire('mbridge', 'task-001', '1a2b3c');
      expect(lock).toBeDefined();
      expect(lock.projectAlias).toBe('mbridge');
      expect(lock.taskId).toBe('task-001');
      expect(lockManager.isLocked('mbridge')).toBe(true);
    });

    // Scenario 2: Lock Conflict on Busy Project
    it('Matrix Scenario 2: Lock Conflict on Busy Project -> Rejected immediately with 409 message', () => {
      lockManager.acquire('mbridge', 'task-001', '3a8f12');

      expect(() => lockManager.acquire('mbridge', 'task-002', '4d5e6f')).toThrowError(
        '⚠️ Project "mbridge" is busy running task [3a8f12]. Use /cancel mbridge to abort it first.'
      );
    });
  });
});
