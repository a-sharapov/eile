import type { MessageKey } from './i18n.ts';
import type { PageAction } from './types.ts';

/** Что сделали со страницей — подпись строки журнала. */
export var ACTION_LABEL: Readonly<Record<PageAction, MessageKey>> = {
  created: 'activity.created',
  edited: 'activity.edited',
  published: 'activity.published',
  unpublished: 'activity.unpublished',
  moved: 'activity.moved',
  trashed: 'activity.trashed',
  restored: 'activity.restored',
  duplicated: 'activity.duplicated',
};
