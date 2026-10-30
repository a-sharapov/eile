import type { Database } from '../../platform/database.ts';
import type { EventBus } from '../../shared/kernel/events.ts';
import { defineIdentityService } from './application/identity-service.ts';
import {
  bunPasswordHasher,
  cryptoTokens,
  defineSessionRepository,
  defineUserRepository,
} from './infrastructure/sqlite-identity.ts';

export type {
  IdentityService,
  Login,
  UserView,
} from './application/identity-service.ts';
export type { IdentityEvent } from './domain/events.ts';
export { can, type Permission, type Role } from './domain/user.ts';
export { identityMigrations } from './infrastructure/sqlite-identity.ts';

/** Контекст identity: пользователи менеджера, роли и сессии. */
export var defineIdentity = ({
  db,
  bus,
  clock,
}: {
  db: Database;
  bus: EventBus;
  clock: () => Date;
}) =>
  defineIdentityService({
    users: defineUserRepository(db),
    sessions: defineSessionRepository(db),
    hasher: bunPasswordHasher,
    tokens: cryptoTokens,
    bus,
    clock,
  });
