import type { Role } from './types.ts';

// Права ролей — те же, что у сервера (`identity/domain/user.ts`): по ним SPA решает, что показать, а сервер —
// что разрешить. Совпадение таблиц проверяет tests/manager-analytics.test.ts.

export type Permission =
  | 'content.edit'
  | 'content.purge'
  | 'design.edit'
  | 'site.edit'
  | 'users.manage'
  | 'forms.edit'
  | 'inbox.read'
  | 'inbox.delete'
  | 'stats.read'
  | 'analytics.read'
  | 'analytics.edit';

export var PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  admin: [
    'content.edit',
    'content.purge',
    'design.edit',
    'site.edit',
    'users.manage',
    'forms.edit',
    'inbox.read',
    'inbox.delete',
    'stats.read',
    'analytics.read',
    'analytics.edit',
  ],
  editor: ['content.edit', 'inbox.read', 'stats.read'],
};

/** Есть ли у роли право; без роли (не вошёл) — нет. */
export var allows = (role: Role | undefined, permission: Permission): boolean =>
  role !== undefined && PERMISSIONS[role].includes(permission);
