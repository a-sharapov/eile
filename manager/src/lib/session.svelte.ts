import { api } from './api.ts';
import { applyAppearance } from './appearance.svelte.ts';
import type { Session } from './types.ts';

export var session = $state<Session & { loaded: boolean }>({
  user: null,
  setup: false,
  appearance: null,
  site: { name: '', url: '' },
  ai: false,
  version: '',
  loaded: false,
});

export var loadSession = (): Promise<Session> =>
  api
    .get<Session>('/session')
    .then(
      (_) => (
        Object.assign(session, _, { loaded: true }),
        void (_.appearance && applyAppearance(_.appearance)),
        _
      )
    );

export var signOut = (): Promise<void> =>
  api.send('DELETE', '/session').then(() => void (session.user = null));
