import { describe, expect, it } from 'vitest';
import {
  COMP_ROLES,
  PERMISSION_MATRIX,
  RESOURCES,
  permittedRoles,
  type CompRole,
  type Operation,
  type Resource,
} from '@/lib/permissions/matrix';

// Expected matrix transcribed independently from ARCHITECTURE.md section 3,
// so the test fails if matrix.ts drifts from the documented permissions.
const EXPECTED: Record<Resource, Record<Operation, CompRole[]>> = {
  competitions: {
    read: ['meet_director', 'scorekeeper', 'table_loader', 'announcer', 'viewer'],
    write: ['meet_director'],
  },
  divisions: {
    read: ['meet_director', 'scorekeeper', 'table_loader', 'announcer', 'viewer'],
    write: ['meet_director'],
  },
  weight_classes: {
    read: ['meet_director', 'scorekeeper', 'table_loader', 'announcer', 'viewer'],
    write: ['meet_director'],
  },
  platforms: {
    read: ['meet_director', 'scorekeeper', 'table_loader', 'announcer', 'viewer'],
    write: ['meet_director'],
  },
  sessions: {
    read: ['meet_director', 'scorekeeper', 'table_loader', 'announcer', 'viewer'],
    write: ['meet_director'],
  },
  flights: {
    read: ['meet_director', 'scorekeeper', 'table_loader', 'announcer', 'viewer'],
    write: ['meet_director', 'scorekeeper'],
  },
  lifters: {
    read: ['meet_director', 'scorekeeper', 'table_loader', 'announcer', 'viewer'],
    write: ['meet_director', 'scorekeeper', 'table_loader'],
  },
  entries: {
    read: ['meet_director', 'scorekeeper', 'table_loader', 'announcer', 'viewer'],
    write: ['meet_director', 'scorekeeper', 'table_loader'],
  },
  attempts: {
    read: ['meet_director', 'scorekeeper', 'table_loader', 'announcer', 'viewer'],
    write: ['meet_director', 'scorekeeper', 'table_loader'],
  },
  referee_decisions: {
    read: ['meet_director', 'scorekeeper', 'table_loader', 'announcer', 'viewer'],
    write: ['meet_director', 'scorekeeper'],
  },
  comp_roles: {
    read: ['meet_director', 'scorekeeper', 'table_loader', 'announcer'],
    write: ['meet_director'],
  },
};

const OPERATIONS: Operation[] = ['read', 'write'];

describe('permission matrix', () => {
  it('exposes the eleven matrix resources', () => {
    expect([...RESOURCES]).toEqual(Object.keys(EXPECTED));
  });

  it('exposes the five matrix roles', () => {
    expect([...COMP_ROLES]).toEqual([
      'meet_director',
      'scorekeeper',
      'table_loader',
      'announcer',
      'viewer',
    ]);
  });

  it('matches the documented matrix for every resource and operation', () => {
    for (const resource of RESOURCES) {
      for (const operation of OPERATIONS) {
        expect(PERMISSION_MATRIX[resource][operation]).toEqual(EXPECTED[resource][operation]);
      }
    }
  });

  it('permittedRoles returns the matrix entry for every resource and operation', () => {
    for (const resource of RESOURCES) {
      for (const operation of OPERATIONS) {
        expect(permittedRoles(resource, operation)).toBe(PERMISSION_MATRIX[resource][operation]);
        expect(permittedRoles(resource, operation)).toEqual(EXPECTED[resource][operation]);
      }
    }
  });

  it('only ever permits known roles', () => {
    for (const resource of RESOURCES) {
      for (const operation of OPERATIONS) {
        for (const role of permittedRoles(resource, operation)) {
          expect(COMP_ROLES).toContain(role);
        }
      }
    }
  });

  it('grants write access only to staff roles, never viewer', () => {
    for (const resource of RESOURCES) {
      expect(permittedRoles(resource, 'write')).not.toContain('viewer');
    }
  });

  it('restricts comp_roles reads to staff (no public viewer)', () => {
    expect(permittedRoles('comp_roles', 'read')).not.toContain('viewer');
  });
});
