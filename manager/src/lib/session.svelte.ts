import { api } from './api.ts';
import { adoptLanguage, applyAppearance } from './appearance.svelte.ts';
import { allows, type Permission } from './permissions.ts';
import type { Session } from './types.ts';

export var session = $state<Session & { loaded: boolean }>({
  user: null,
  setup: false,
  appearance: null,
  site: { name: '', url: '' },
  ai: false,
  aiVision: false,
  version: '',
  passwordReset: false,
  update: null,
  loaded: false,
});

export var loadSession = (): Promise<Session> =>
  api
    .get<Session>('/session')
    .then((_) =>
      (_.appearance
        ? (applyAppearance(_.appearance), adoptLanguage(_.appearance.language))
        : Promise.resolve()
      ).then(() => (Object.assign(session, _, { loaded: true }), _))
    );

/** Есть ли у вошедшего право: экран прячет то, чего сервер всё равно не разрешит. */
export var can = (permission: Permission): boolean =>
  allows(session.user?.role, permission);

export var signOut = (): Promise<void> =>
  api.send('DELETE', '/session').then(() => void (session.user = null));
