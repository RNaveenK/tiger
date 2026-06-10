import { describe, it, expect, beforeEach } from 'vitest';
import {
  SecurityAuditService,
  SecurityAuditInput,
  ActionType,
} from '../../src/services/security-audit.service.js';

describe('SecurityAuditService', () => {
  let service: SecurityAuditService;

  beforeEach(() => {
    service = new SecurityAuditService();
    service.clear();
  });

  describe('logAction', () => {
    it('should log a successful login action', () => {
      const input: SecurityAuditInput = {
        userId: 'user-001',
        actionType: 'login',
        outcome: 'success',
        ipAddress: '192.168.1.1',
      };

      const entry = service.logAction(input);

      expect(entry.id).toBeDefined();
      expect(entry.userId).toBe('user-001');
      expect(entry.actionType).toBe('login');
      expect(entry.outcome).toBe('success');
      expect(entry.ipAddress).toBe('192.168.1.1');
      expect(entry.resourceType).toBeNull();
      expect(entry.resourceId).toBeNull();
      expect(entry.details).toBeNull();
      expect(entry.createdAt).toBeDefined();
    });

    it('should log a failed login attempt with null userId', () => {
      const input: SecurityAuditInput = {
        userId: null,
        actionType: 'login',
        outcome: 'failure',
        ipAddress: '10.0.0.5',
        details: { reason: 'invalid_credentials', username: 'unknown_user' },
      };

      const entry = service.logAction(input);

      expect(entry.userId).toBeNull();
      expect(entry.actionType).toBe('login');
      expect(entry.outcome).toBe('failure');
      expect(entry.details).toEqual({ reason: 'invalid_credentials', username: 'unknown_user' });
    });

    it('should log a logout action', () => {
      const entry = service.logAction({
        userId: 'user-002',
        actionType: 'logout',
        outcome: 'success',
        ipAddress: '172.16.0.1',
      });

      expect(entry.actionType).toBe('logout');
      expect(entry.outcome).toBe('success');
    });

    it('should log an upload action with resource identifiers', () => {
      const entry = service.logAction({
        userId: 'user-003',
        actionType: 'upload',
        resourceType: 'upload',
        resourceId: 'upload-abc-123',
        outcome: 'success',
        ipAddress: '192.168.1.10',
        details: { fileName: 'prices.csv', totalRows: 5000 },
      });

      expect(entry.actionType).toBe('upload');
      expect(entry.resourceType).toBe('upload');
      expect(entry.resourceId).toBe('upload-abc-123');
      expect(entry.details).toEqual({ fileName: 'prices.csv', totalRows: 5000 });
    });

    it('should log a search action', () => {
      const entry = service.logAction({
        userId: 'user-004',
        actionType: 'search',
        outcome: 'success',
        ipAddress: '10.1.1.1',
        details: { criteria: { storeId: 'STORE-001' }, resultCount: 150 },
      });

      expect(entry.actionType).toBe('search');
      expect(entry.outcome).toBe('success');
      expect(entry.details).toEqual({ criteria: { storeId: 'STORE-001' }, resultCount: 150 });
    });

    it('should log an edit action with resource identifiers', () => {
      const entry = service.logAction({
        userId: 'user-005',
        actionType: 'edit',
        resourceType: 'pricing_record',
        resourceId: 'record-xyz-789',
        outcome: 'success',
        ipAddress: '192.168.2.50',
        details: { changedFields: ['price', 'productName'] },
      });

      expect(entry.actionType).toBe('edit');
      expect(entry.resourceType).toBe('pricing_record');
      expect(entry.resourceId).toBe('record-xyz-789');
    });

    it('should log a lockout action', () => {
      const entry = service.logAction({
        userId: 'user-006',
        actionType: 'lockout',
        outcome: 'failure',
        ipAddress: '10.0.0.99',
        details: { failedAttempts: 5, lockDurationMinutes: 15 },
      });

      expect(entry.actionType).toBe('lockout');
      expect(entry.outcome).toBe('failure');
      expect(entry.details).toEqual({ failedAttempts: 5, lockDurationMinutes: 15 });
    });

    it('should generate a unique ID for each entry', () => {
      const entry1 = service.logAction({
        userId: 'user-001',
        actionType: 'login',
        outcome: 'success',
      });
      const entry2 = service.logAction({
        userId: 'user-001',
        actionType: 'logout',
        outcome: 'success',
      });

      expect(entry1.id).not.toBe(entry2.id);
    });

    it('should generate a valid UUID format', () => {
      const entry = service.logAction({
        userId: 'user-001',
        actionType: 'login',
        outcome: 'success',
      });

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(entry.id).toMatch(uuidRegex);
    });

    it('should record a valid ISO 8601 timestamp', () => {
      const before = new Date().toISOString();
      const entry = service.logAction({
        userId: 'user-001',
        actionType: 'login',
        outcome: 'success',
      });
      const after = new Date().toISOString();

      expect(entry.createdAt >= before).toBe(true);
      expect(entry.createdAt <= after).toBe(true);
    });

    it('should default optional fields to null when not provided', () => {
      const entry = service.logAction({
        userId: 'user-001',
        actionType: 'search',
        outcome: 'success',
      });

      expect(entry.resourceType).toBeNull();
      expect(entry.resourceId).toBeNull();
      expect(entry.ipAddress).toBeNull();
      expect(entry.details).toBeNull();
    });
  });

  describe('getAll', () => {
    it('should return empty array when no entries exist', () => {
      expect(service.getAll()).toEqual([]);
    });

    it('should return all logged entries', () => {
      service.logAction({ userId: 'u1', actionType: 'login', outcome: 'success' });
      service.logAction({ userId: 'u2', actionType: 'logout', outcome: 'success' });
      service.logAction({ userId: 'u3', actionType: 'upload', outcome: 'failure' });

      const all = service.getAll();
      expect(all).toHaveLength(3);
    });

    it('should return a copy (not mutable reference)', () => {
      service.logAction({ userId: 'u1', actionType: 'login', outcome: 'success' });

      const all = service.getAll();
      all.push({} as any);

      expect(service.getAll()).toHaveLength(1);
    });
  });

  describe('getByUserId', () => {
    it('should filter entries by user ID', () => {
      service.logAction({ userId: 'user-A', actionType: 'login', outcome: 'success' });
      service.logAction({ userId: 'user-B', actionType: 'login', outcome: 'success' });
      service.logAction({ userId: 'user-A', actionType: 'search', outcome: 'success' });

      const results = service.getByUserId('user-A');
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.userId === 'user-A')).toBe(true);
    });

    it('should return empty array for non-existent user', () => {
      service.logAction({ userId: 'user-A', actionType: 'login', outcome: 'success' });
      expect(service.getByUserId('non-existent')).toEqual([]);
    });
  });

  describe('getByActionType', () => {
    it('should filter entries by action type', () => {
      service.logAction({ userId: 'u1', actionType: 'login', outcome: 'success' });
      service.logAction({ userId: 'u2', actionType: 'upload', outcome: 'success' });
      service.logAction({ userId: 'u3', actionType: 'login', outcome: 'failure' });

      const results = service.getByActionType('login');
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.actionType === 'login')).toBe(true);
    });

    it('should return empty array for action type with no entries', () => {
      service.logAction({ userId: 'u1', actionType: 'login', outcome: 'success' });
      expect(service.getByActionType('edit')).toEqual([]);
    });
  });

  describe('getByOutcome', () => {
    it('should filter entries by outcome', () => {
      service.logAction({ userId: 'u1', actionType: 'login', outcome: 'success' });
      service.logAction({ userId: 'u2', actionType: 'login', outcome: 'failure' });
      service.logAction({ userId: 'u3', actionType: 'upload', outcome: 'failure' });

      const failures = service.getByOutcome('failure');
      expect(failures).toHaveLength(2);
      expect(failures.every((e) => e.outcome === 'failure')).toBe(true);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      service.logAction({ userId: 'u1', actionType: 'login', outcome: 'success' });
      service.logAction({ userId: 'u2', actionType: 'logout', outcome: 'success' });

      expect(service.count()).toBe(2);
      service.clear();
      expect(service.count()).toBe(0);
      expect(service.getAll()).toEqual([]);
    });
  });

  describe('count', () => {
    it('should return 0 for empty log', () => {
      expect(service.count()).toBe(0);
    });

    it('should return correct count after multiple entries', () => {
      service.logAction({ userId: 'u1', actionType: 'login', outcome: 'success' });
      service.logAction({ userId: 'u2', actionType: 'search', outcome: 'success' });
      expect(service.count()).toBe(2);
    });
  });

  describe('all action types', () => {
    const actionTypes: ActionType[] = ['login', 'logout', 'upload', 'search', 'edit', 'lockout'];

    actionTypes.forEach((actionType) => {
      it(`should accept and persist '${actionType}' action type`, () => {
        const entry = service.logAction({
          userId: 'user-test',
          actionType,
          outcome: 'success',
        });

        expect(entry.actionType).toBe(actionType);
        expect(service.count()).toBe(1);
        service.clear();
      });
    });
  });
});
