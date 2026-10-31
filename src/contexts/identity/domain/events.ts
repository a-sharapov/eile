import type { UserId } from './user.ts';

export type IdentityEvent = {
  readonly type:
    | 'identity.user_created'
    | 'identity.user_removed'
    | 'identity.password_changed'
    | 'identity.password_reset'
    | 'identity.role_changed'
    | 'identity.token_issued'
    | 'identity.token_revoked';
  readonly userId: UserId;
};
