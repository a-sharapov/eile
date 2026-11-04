import type { Database } from '../../platform/database.ts';
import { fail } from '../../shared/kernel/errors.ts';
import type { EventBus } from '../../shared/kernel/events.ts';
import { pipe } from '../../shared/kernel/pipe.ts';
import { defineIdentityService } from './application/identity-service.ts';
import type { Email } from './domain/user.ts';
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
  TokenLogin,
  UserView,
} from './application/identity-service.ts';
export type { IdentityEvent } from './domain/events.ts';
export { can, type Permission, type Role } from './domain/user.ts';
export {
  IDENTITY_SERVER_TABLES,
  identityMigrations,
} from './infrastructure/sqlite-identity.ts';

/** Ключ API в файле настроек сервера: хэш, подпись и чей — по почте, а не по номеру пользователя. */
export type CarriedToken = {
  readonly email: string;
  readonly name: string;
  readonly tokenHash: string;
  readonly hint: string;
  readonly createdAt: string;
  /** Правки ключа ждут проверки; в файлах настроек старых версий поля нет. */
  readonly review?: boolean;
};

/** Что стало с привезёнными ключами: добавлены, уже были, пользователя с такой почтой нет. */
export type TokensApplied = {
  readonly added: number;
  readonly present: number;
  readonly skipped: readonly string[];
};

const _HASH = /^[0-9a-f]{64}$/;

const _carried = (raw: unknown): CarriedToken =>
  ((_) =>
    typeof _.email === 'string' &&
    typeof _.name === 'string' &&
    typeof _.tokenHash === 'string' &&
    _HASH.test(_.tokenHash) &&
    typeof _.hint === 'string' &&
    typeof _.createdAt === 'string'
      ? (_ as CarriedToken)
      : fail('identity.invalid_settings', 'An API token entry is not valid'))(
    (raw ?? {}) as Record<string, unknown>
  );

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
}) => {
  const users = defineUserRepository(db);
  const apiTokens = defineApiTokenRepository(db);
  return {
    ...defineIdentityService({
      users,
      sessions: defineSessionRepository(db),
      resets: definePasswordResetRepository(db),
      apiTokens,
      hasher: bunPasswordHasher,
      tokens: cryptoTokens,
      bus,
      clock,
      setup,
    }),
    /**
     * Ключи API — для файла настроек сервера: хэши, как у токенов почтового шлюза. На новой машине ключ
     * достаётся пользователю с той же почтой; нет такого — ключ пропускается.
     */
    serverSettings: {
      read: (): CarriedToken[] =>
        users.all().flatMap((user) =>
          apiTokens.of(user.id).map((_) => ({
            email: user.email,
            name: _.name,
            tokenHash: _.tokenHash,
            hint: _.hint,
            createdAt: _.createdAt,
            review: _.review,
          }))
        ),
      apply: (raw: unknown): TokensApplied =>
        pipe(
          (_: unknown) =>
            Array.isArray(_)
              ? _.map(_carried)
              : fail('identity.invalid_settings', 'API tokens are not a list'),
          (carried) =>
            carried.map((token) =>
              ((user) =>
                !user
                  ? { outcome: 'skipped' as const, email: token.email }
                  : apiTokens.byHash(token.tokenHash)
                    ? { outcome: 'present' as const, email: token.email }
                    : (apiTokens.add({
                        userId: user.id,
                        name: token.name,
                        tokenHash: token.tokenHash,
                        hint: token.hint,
                        createdAt: token.createdAt,
                        usedAt: null,
                        review: token.review === true,
                      }),
                      { outcome: 'added' as const, email: token.email }))(
                users.byEmail(token.email.toLowerCase() as Email)
              )
            ),
          (outcomes) => ({
            added: outcomes.filter((_) => _.outcome === 'added').length,
            present: outcomes.filter((_) => _.outcome === 'present').length,
            skipped: [
              ...new Set(
                outcomes
                  .filter((_) => _.outcome === 'skipped')
                  .map((_) => _.email)
              ),
            ],
          })
        )(raw),
    },
  };
};

export type Identity = ReturnType<typeof defineIdentity>;
