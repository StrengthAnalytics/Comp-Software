// Permission matrix mirroring ARCHITECTURE.md section 3.
// Source of truth for role-based access, enforced in two places that must agree:
// RLS policies on Postgres tables, and requireRole() checks in server actions.

export const COMP_ROLES = [
  'meet_director',
  'scorekeeper',
  'table_loader',
  'announcer',
  'viewer',
] as const;

export type CompRole = (typeof COMP_ROLES)[number];

export const RESOURCES = [
  'competitions',
  'divisions',
  'weight_classes',
  'platforms',
  'sessions',
  'flights',
  'lifters',
  'entries',
  'attempts',
  'referee_decisions',
  'comp_roles',
] as const;

export type Resource = (typeof RESOURCES)[number];

export type Operation = 'read' | 'write';

type ResourcePermissions = Readonly<Record<Operation, readonly CompRole[]>>;

// All five roles can read (the public/viewer role reads published data only, enforced in RLS).
const ALL_READERS: readonly CompRole[] = [
  'meet_director',
  'scorekeeper',
  'table_loader',
  'announcer',
  'viewer',
];

export const PERMISSION_MATRIX: Readonly<Record<Resource, ResourcePermissions>> = {
  competitions: { read: ALL_READERS, write: ['meet_director'] },
  divisions: { read: ALL_READERS, write: ['meet_director'] },
  weight_classes: { read: ALL_READERS, write: ['meet_director'] },
  platforms: { read: ALL_READERS, write: ['meet_director'] },
  sessions: { read: ALL_READERS, write: ['meet_director'] },
  flights: { read: ALL_READERS, write: ['meet_director', 'scorekeeper'] },
  lifters: { read: ALL_READERS, write: ['meet_director', 'scorekeeper', 'table_loader'] },
  entries: { read: ALL_READERS, write: ['meet_director', 'scorekeeper', 'table_loader'] },
  // table_loader is limited to declared weight only; that column-level rule is enforced in the server action.
  attempts: { read: ALL_READERS, write: ['meet_director', 'scorekeeper', 'table_loader'] },
  referee_decisions: { read: ALL_READERS, write: ['meet_director', 'scorekeeper'] },
  // comp_roles has no public read: viewer is excluded.
  comp_roles: {
    read: ['meet_director', 'scorekeeper', 'table_loader', 'announcer'],
    write: ['meet_director'],
  },
} as const;

// The roles permitted to perform an operation on a resource.
export function permittedRoles(resource: Resource, operation: Operation): readonly CompRole[] {
  return PERMISSION_MATRIX[resource][operation];
}
