import type { UserId } from './user.ts';

export type IdentityEvent = {
  readonly type:
    | 'identity.user_created'
    | 'identity.user_removed'
    | 'identity.password_changed'
    | 'identity.role_changed';
  readonly userId: UserId;
};
