import type { Database } from '../../platform/database.ts';
import type { EventBus } from '../../shared/kernel/events.ts';
import { defineIdentityService } from './application/identity-service.ts';
import {
  bunPasswordHasher,
  cryptoTokens,
  defineApiTokenRepository,
  definePasswordResetRepository,
  defineSessionRepository,
  defineUserRepository,
} from './infrastructure/sqlite-identity.ts';

export type {
  ApiTokenView,
  IdentityService,
  IssuedToken,
  Login,
  ResetLink,
  UserView,
} from './application/identity-service.ts';
export type { IdentityEvent } from './domain/events.ts';
export { can, type Permission, type Role } from './domain/user.ts';
export {
  IDENTITY_SERVER_TABLES,
  identityMigrations,
} from './infrastructure/sqlite-identity.ts';

/** Контекст identity: пользователи менеджера, роли и сессии. */
export var defineIdentity = ({
  db,
  bus,
  clock,
  setup,
}: {
  db: Database;
  bus: EventBus;
  clock: () => Date;
  setup?: string | null;
}) =>
  defineIdentityService({
    users: defineUserRepository(db),
    sessions: defineSessionRepository(db),
    resets: definePasswordResetRepository(db),
    apiTokens: defineApiTokenRepository(db),
    hasher: bunPasswordHasher,
    tokens: cryptoTokens,
    bus,
    clock,
    setup,
  });
