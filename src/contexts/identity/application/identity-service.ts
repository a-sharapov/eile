import { domainError, fail } from '../../../shared/kernel/errors.ts';
import type { EventBus } from '../../../shared/kernel/events.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import type { IdentityEvent } from '../domain/events.ts';
import type {
  PasswordHasher,
  PasswordReset,
  PasswordResetRepository,
  SessionRepository,
  Tokens,
  UserRepository,
} from '../domain/ports.ts';
import {
  changePassword,
  changeRole,
  checkPassword,
  createUser,
  type Email,
  MAX_PASSWORD,
  type NewUser,
  parseEmail,
  parseUserId,
  type Role,
  resetPassword,
  type User,
  type UserChange,
  type UserId,
} from '../domain/user.ts';

/** Пользователь без хэша пароля: то, что можно отдать наружу. */
export type UserView = {
  readonly id: number;
  readonly email: string;
  readonly name: string;
  readonly role: Role;
};

export type Login = { readonly token: string; readonly user: UserView };

/** Ссылка сброса пароля для письма: токен — только здесь, в базе его хэш. */
export type ResetLink = { readonly token: string; readonly user: UserView };

const _SESSION_DAYS = 30;
// Неудачи считаются на почту с одного адреса: чужой адрес не запрёт владельца. Общий потолок на почту
// со всех адресов — против перебора с многих машин.
const _MAX_FAILURES = 5;
const _MAX_FAILURES_EMAIL = 50;
const _LOCK_MINUTES = 15;
const _MINUTE = 60_000;
const _TRACKED = 10_000;
// Проверок пароля одновременно: каждая — argon2 на 64 МБ памяти.
const _IN_FLIGHT = 16;
// Ссылка сброса живёт полчаса. Запросов письма за окно: на почту с одного адреса, на почту вообще и с
// одного адреса на любые почты — иначе чужой ящик можно завалить письмами.
const _RESET_MINUTES = 30;
const _RESET_REQUESTS: Readonly<Record<'pair' | 'email' | 'client', number>> = {
  pair: 3,
  email: 10,
  client: 20,
};

const _removed = (userId: UserId): IdentityEvent => ({
  type: 'identity.user_removed',
  userId,
});

const _view = (user: User): UserView => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
});

export var defineIdentityService = ({
  users,
  sessions,
  resets,
  hasher,
  tokens,
  bus,
  clock,
}: {
  users: UserRepository;
  sessions: SessionRepository;
  resets: PasswordResetRepository;
  hasher: PasswordHasher;
  tokens: Tokens;
  bus: EventBus;
  clock: () => Date;
}) => {
  // Пока пользователей нет, менеджер открывает только настройку по этому токену из журнала сервера.
  let setupToken: string | null = users.count() === 0 ? tokens.issue() : null;
  const attempts = new Map<string, { count: number; since: number }>();
  const resetRequests = new Map<string, { count: number; since: number }>();
  let inFlight = 0;

  // Проверка хэша и для несуществующего адреса: время ответа не выдаёт, есть ли пользователь.
  const dummyHash = hasher.hash(tokens.issue());

  const store = (change: UserChange): User => (
    users.save(change.state), change.events.forEach(bus.publish), change.state
  );

  const load = (id: number): User =>
    users.get(parseUserId(id)) ??
    fail('identity.user_not_found', `User ${id} not found`);

  const _window = _LOCK_MINUTES * _MINUTE;

  const fresh = (key: string, now: number, table = attempts) =>
    ((entry) => (entry && now - entry.since < _window ? entry : null))(
      table.get(key)
    );

  const keysOf = (email: Email, client: string) => ({
    pair: `${email} ${client}`,
    email: `${email} *`,
  });

  // Таблица не растёт без конца: сначала уходят устаревшие записи, потом самые старые.
  const prune = (now: number, table = attempts): void =>
    void (
      table.size > _TRACKED &&
      ([...table].forEach(
        ({ 0: key, 1: entry }) =>
          void (now - entry.since >= _window && table.delete(key))
      ),
      [...table.keys()]
        .slice(0, Math.max(0, table.size - _TRACKED))
        .forEach((key) => void table.delete(key)))
    );

  const bump = (key: string, now: number, table = attempts): void =>
    void table.set(
      key,
      ((entry) =>
        entry
          ? { ...entry, count: entry.count + 1 }
          : { count: 1, since: now })(fresh(key, now, table))
    );

  /**
   * Попытка засчитывается до проверки хэша, синхронно: параллельные запросы не проскочат блокировку,
   * пока первые ещё считают argon2. Удачный вход снимает свою попытку. Место среди одновременных
   * проверок занимается тут же, освобождает его `verify`.
   */
  const reserve = (email: Email, client: string): Email => {
    const now = clock().getTime();
    const keys = keysOf(email, client);
    const locked =
      (fresh(keys.pair, now)?.count ?? 0) >= _MAX_FAILURES ||
      (fresh(keys.email, now)?.count ?? 0) >= _MAX_FAILURES_EMAIL;
    return locked || inFlight >= _IN_FLIGHT
      ? fail('identity.too_many_attempts', 'Too many failed logins, try later')
      : (bump(keys.pair, now),
        bump(keys.email, now),
        prune(now),
        (inFlight += 1),
        email);
  };

  const forget = (email: Email, client: string): void => {
    const keys = keysOf(email, client);
    const shared = attempts.get(keys.email);
    attempts.delete(keys.pair);
    void (
      shared &&
      (shared.count > 1
        ? attempts.set(keys.email, { ...shared, count: shared.count - 1 })
        : attempts.delete(keys.email))
    );
  };

  // Новый сеанс — повод убрать просроченные: иначе они копились бы в базе вечно.
  const openSession = (user: User): Login => {
    sessions.removeExpired(clock().toISOString());
    const token = tokens.issue();
    sessions.save({
      tokenHash: tokens.hash(token),
      userId: user.id,
      expiresAt: new Date(
        clock().getTime() + _SESSION_DAYS * 24 * 60 * _MINUTE
      ).toISOString(),
    });
    return { token, user: _view(user) };
  };

  // Запрос письма считается до поиска пользователя: есть адрес или нет, лимит один и тот же.
  const reserveReset = (email: Email, client: string): Email => {
    const now = clock().getTime();
    const keys = { ...keysOf(email, client), client: `* ${client}` };
    const over = (Object.keys(_RESET_REQUESTS) as (keyof typeof keys)[]).some(
      (_) =>
        (fresh(keys[_], now, resetRequests)?.count ?? 0) >= _RESET_REQUESTS[_]
    );
    return over
      ? fail('identity.too_many_requests', 'Too many reset requests, try later')
      : (Object.values(keys).forEach((_) => void bump(_, now, resetRequests)),
        prune(now, resetRequests),
        email);
  };

  // Новая ссылка отменяет прежние ссылки пользователя; просроченные чужие тоже убираются.
  const issueReset = (user: User): ResetLink => {
    const now = clock();
    resets.removeExpired(now.toISOString());
    resets.removeOf(user.id);
    const token = tokens.issue();
    resets.save({
      tokenHash: tokens.hash(token),
      userId: user.id,
      expiresAt: new Date(
        now.getTime() + _RESET_MINUTES * _MINUTE
      ).toISOString(),
    });
    return { token, user: _view(user) };
  };

  const resetOf = (token: string): PasswordReset | null =>
    ((reset) =>
      reset &&
      reset.expiresAt > clock().toISOString() &&
      users.get(reset.userId)
        ? reset
        : null)(token ? resets.get(tokens.hash(token)) : null);

  const _invalidReset = (): never =>
    fail('identity.reset_invalid', 'The reset link is invalid or expired');

  const _wrong = (): never =>
    fail('identity.invalid_credentials', 'Wrong email or password');

  // Слишком длинный пароль заведомо неверен: его не хешируем, но попытку он тратит.
  const verify =
    (password: string, client: string) =>
    (email: Email): Promise<User> => {
      const user = users.byEmail(email);
      return (
        password.length > MAX_PASSWORD
          ? Promise.resolve(false)
          : dummyHash.then((dummy) =>
              hasher.verify(password, user?.passwordHash ?? dummy)
            )
      )
        .finally(() => void (inFlight -= 1))
        .then((ok) => (ok && user ? (forget(email, client), user) : _wrong()));
    };

  const create = (input: NewUser & { password: string }): Promise<User> =>
    Promise.resolve(input.password).then(
      pipe(checkPassword, hasher.hash, (hash) =>
        users.byEmail(parseEmail(input.email))
          ? fail(
              'identity.email_taken',
              `${input.email} already has an account`
            )
          : store(createUser(users.nextId(), input, hash))
      )
    );

  const admins = (): User[] => users.all().filter((_) => _.role === 'admin');

  const assertNotLastAdmin = (user: User): User =>
    user.role === 'admin' && admins().length === 1
      ? fail('identity.last_admin', 'The last administrator cannot be removed')
      : user;

  return {
    setup: {
      // Пользователь мог появиться и мимо настройки (`cms users add` при работающем сервере):
      // тогда ссылка из журнала больше не открывает настройку.
      token: (): string | null => (users.count() === 0 ? setupToken : null),
      /** Первый администратор; токен печатается в журнал при старте без пользователей. */
      complete: (
        token: string,
        input: Omit<NewUser, 'role'> & { password: string }
      ): Promise<Login> =>
        // Токен забирается сразу, до хеширования: второй такой же запрос его уже не найдёт.
        ((claimed) =>
          claimed === null
            ? Promise.reject(
                domainError('identity.setup_closed', 'Setup is not available')
              )
            : create({ ...input, role: 'admin' }).then(openSession, (error) => {
                setupToken = claimed;
                throw error;
              }))(
          setupToken !== null && users.count() === 0 && token === setupToken
            ? ((setupToken = null), token)
            : null
        ),
    },
    /** `client` — адрес посетителя: неудачи считаются на почту с этого адреса. */
    login: (email: string, password: string, client = ''): Promise<Login> =>
      Promise.resolve(email).then(
        pipe(
          parseEmail,
          (_) => reserve(_, client),
          verify(String(password), client),
          openSession
        )
      ),
    logout: (token: string): void => sessions.remove(tokens.hash(token)),
    /** Сброс пароля по ссылке из письма; само письмо отправляет тот, кто знает почту сайта. */
    recovery: {
      /** Ссылка для письма или null, если такой почты нет: отвечать на запрос надо одинаково. */
      request: (email: string, client = ''): ResetLink | null =>
        pipe(
          parseEmail,
          (_: Email) => reserveReset(_, client),
          (_: Email) =>
            ((user) => (user ? issueReset(user) : null))(users.byEmail(_))
        )(email),
      /** Ссылка ещё действует: страница сброса сразу говорит, что она устарела. */
      check: (token: string): boolean => resetOf(token) !== null,
      /**
       * Новый пароль: проверяется до того, как ссылка погаснет, — короткий пароль её не тратит. Ссылка
       * гасится до хеширования: второй такой же запрос её уже не найдёт. Все сеансы закрываются.
       */
      reset: (token: string, password: string): Promise<UserView> =>
        Promise.resolve(password).then(
          pipe(
            checkPassword,
            (valid) =>
              ((reset) => (resets.removeOf(reset.userId), { reset, valid }))(
                resetOf(token) ?? _invalidReset()
              ),
            ({ reset, valid }) =>
              hasher.hash(valid).then((hash) => ({ reset, hash })),
            ({ reset, hash }) => store(resetPassword(hash)(load(reset.userId))),
            (user) => (sessions.removeOf(user.id), _view(user))
          )
        ),
    },
    account: {
      /**
       * Свой пароль: сначала текущий (неудачи считаются, как при входе).
       * Все сеансы закрываются, вместо текущего открывается новый.
       */
      changePassword: (
        id: number,
        current: string,
        password: string,
        client = ''
      ): Promise<Login> =>
        Promise.resolve(load(id).email).then(
          pipe(
            (_) => reserve(_, client),
            verify(String(current), client),
            (user) =>
              Promise.resolve(password).then(
                pipe(checkPassword, hasher.hash, (hash) =>
                  store(changePassword(hash)(user))
                )
              ),
            (user) => (sessions.removeOf(user.id), openSession(user))
          )
        ),
    },
    authenticate: (token: string | null): UserView | null => {
      const session = token === null ? null : sessions.get(tokens.hash(token));
      const user =
        session && session.expiresAt > clock().toISOString()
          ? users.get(session.userId)
          : null;
      return user && _view(user);
    },
    sessions: {
      /**
       * После восстановления копии сайта: сеанс остаётся, только если под тем же id тот же человек
       * (та же почта); иначе вошедший оказался бы чужой учётной записью из копии.
       */
      closeChanged: (
        before: readonly { readonly id: number; readonly email: string }[]
      ): void =>
        before
          .filter((_) => users.get(_.id as UserId)?.email !== _.email)
          .forEach(
            (_) =>
              void (sessions.removeOf(_.id as UserId),
              resets.removeOf(_.id as UserId))
          ),
    },
    users: {
      list: (): UserView[] => users.all().map(_view),
      create: (input: NewUser & { password: string }): Promise<UserView> =>
        create(input).then(_view),
      setRole: (id: number, role: string): UserView =>
        pipe(
          load,
          (_: User) => (role === 'admin' ? _ : assertNotLastAdmin(_)),
          changeRole(role),
          store,
          _view
        )(id),
      setPassword: (id: number, password: string): Promise<UserView> =>
        Promise.resolve(password).then(
          pipe(
            checkPassword,
            hasher.hash,
            (hash) => store(changePassword(hash)(load(id))),
            (_) => (sessions.removeOf(_.id), _view(_))
          )
        ),
      remove: (id: number): void =>
        pipe(load, assertNotLastAdmin, (_: User) => {
          sessions.removeOf(_.id);
          users.remove(_.id);
          bus.publish(_removed(_.id));
        })(id),
    },
  };
};

export type IdentityService = ReturnType<typeof defineIdentityService>;
