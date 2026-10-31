import type { Brand } from '../../../shared/kernel/brand.ts';
import { type Changed, changed } from '../../../shared/kernel/changed.ts';
import { fail } from '../../../shared/kernel/errors.ts';
import { pipe } from '../../../shared/kernel/pipe.ts';
import type { IdentityEvent } from './events.ts';

export type UserId = Brand<number, 'UserId'>;

export type Email = Brand<string, 'Email'>;

/** admin — всё; editor — только контент: элементы исполняют код на сервере. */
export type Role = 'admin' | 'editor';

export type Permission =
  | 'content.edit'
  /** Удалить из корзины навсегда: необратимо, поэтому не у каждого, кто правит контент. */
  | 'content.purge'
  | 'design.edit'
  | 'site.edit'
  | 'users.manage'
  /** Собирать формы сайта: их HTML и куда уходят заявки. */
  | 'forms.edit'
  /** Видеть и разбирать заявки с форм — всем менеджерам. */
  | 'inbox.read';

export type User = {
  readonly id: UserId;
  readonly email: Email;
  readonly name: string;
  readonly role: Role;
  readonly passwordHash: string;
};

export type NewUser = {
  readonly email: string;
  readonly name?: string;
  readonly role?: string;
};

export type UserChange = Changed<User, IdentityEvent>;

const _EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const _MIN_PASSWORD = 10;
const _ROLES: readonly Role[] = ['admin', 'editor'];

const _PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  admin: [
    'content.edit',
    'content.purge',
    'design.edit',
    'site.edit',
    'users.manage',
    'forms.edit',
    'inbox.read',
  ],
  editor: ['content.edit', 'inbox.read'],
};

export var parseUserId = (raw: number): UserId =>
  Number.isSafeInteger(raw) && raw > 0
    ? (raw as UserId)
    : fail('identity.invalid_user_id', `Invalid user id ${raw}`);

export var parseEmail = (raw: string): Email =>
  pipe<string, Email>(
    (_: string) => _.trim().toLowerCase(),
    (_: string) =>
      _.length <= 254 && _EMAIL.test(_)
        ? (_ as Email)
        : fail('identity.invalid_email', `"${_}" is not an email address`)
  )(raw);

export var parseRole = (raw: string): Role =>
  _ROLES.includes(raw as Role)
    ? (raw as Role)
    : fail('identity.invalid_role', `Unknown role "${raw}"`);

/** Пароль длиннее не хешируется: argon2 на мегабайтах — работа для перебора, а не защита. */
export var MAX_PASSWORD = 1024;

/** Длина важнее состава: короткий пароль перебирается, длинный — нет. Не строка — не пароль. */
export var checkPassword = (password: unknown): string =>
  typeof password !== 'string'
    ? fail('identity.weak_password', 'Password must be a string')
    : password.length < _MIN_PASSWORD
      ? fail(
          'identity.weak_password',
          `Password must be at least ${_MIN_PASSWORD} characters`
        )
      : password.length > MAX_PASSWORD
        ? fail(
            'identity.weak_password',
            `Password must be at most ${MAX_PASSWORD} characters`
          )
        : password;

export var can = (role: Role, permission: Permission): boolean =>
  _PERMISSIONS[role].includes(permission);

export var createUser = (
  id: UserId,
  input: NewUser,
  passwordHash: string
): UserChange =>
  pipe<string, UserChange>(parseEmail, (email: Email) =>
    changed<User, IdentityEvent>(
      {
        id,
        email,
        name: input.name?.trim() || email.slice(0, email.indexOf('@')),
        role: parseRole(input.role ?? 'editor'),
        passwordHash,
      },
      { type: 'identity.user_created', userId: id }
    )
  )(input.email);

export var changePassword =
  (passwordHash: string) =>
  (user: User): UserChange =>
    changed<User, IdentityEvent>(
      { ...user, passwordHash },
      { type: 'identity.password_changed', userId: user.id }
    );

/** Новый пароль по ссылке из письма: старый неизвестен, поэтому событие своё — его видит аудит. */
export var resetPassword =
  (passwordHash: string) =>
  (user: User): UserChange =>
    changed<User, IdentityEvent>(
      { ...user, passwordHash },
      { type: 'identity.password_reset', userId: user.id }
    );

export var changeRole =
  (role: string) =>
  (user: User): UserChange =>
    pipe<string, UserChange>(parseRole, (_: Role) =>
      _ === user.role
        ? changed(user)
        : changed<User, IdentityEvent>(
            { ...user, role: _ },
            { type: 'identity.role_changed', userId: user.id }
          )
    )(role);
