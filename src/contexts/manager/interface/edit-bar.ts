import {
  type ManagerLanguage,
  managerLanguageOf,
} from '../../../shared/kernel/manager-language.ts';
import { can, type IdentityService } from '../../identity/index.ts';
import {
  type AppearanceRepository,
  DEFAULT_APPEARANCE,
} from '../domain/appearance.ts';
import script from '../infrastructure/edit-bar.client.js' with { type: 'text' };
import { sessionToken } from './api.ts';

/** Скрипт полосы: адрес с хэшем содержимого, браузер кэширует его навсегда. */
export var EDIT_BAR_URL = `/manager/bar.${Bun.hash(script).toString(36)}.js`;

type BarTexts = {
  readonly label: string;
  readonly manager: string;
  readonly edit: string;
  readonly create: string;
  readonly open: string;
  readonly hide: string;
  readonly show: string;
  readonly close: string;
  readonly editing: string;
  readonly creating: string;
  readonly unsaved: string;
};

// Тексты полосы — на языке менеджера у этого пользователя, как и всё, что сервер собирает для него.
const _TEXTS: Readonly<Record<ManagerLanguage, BarTexts>> = {
  en: {
    label: 'Eile: page editing',
    manager: 'Manager',
    edit: 'Edit',
    create: 'Child page',
    open: 'Open in manager',
    hide: 'Hide the bar',
    show: 'Show the Eile bar',
    close: 'Close',
    editing: 'Editing page',
    creating: 'New child page',
    unsaved: 'There are unsaved changes. Close without saving?',
  },
  de: {
    label: 'Eile: Seite bearbeiten',
    manager: 'Manager',
    edit: 'Bearbeiten',
    create: 'Neue Unterseite',
    open: 'Im Manager öffnen',
    hide: 'Leiste ausblenden',
    show: 'Eile-Leiste einblenden',
    close: 'Schließen',
    editing: 'Seite bearbeiten',
    creating: 'Neue Unterseite',
    unsaved:
      'Es gibt ungespeicherte Änderungen. Trotzdem schließen, ohne zu speichern?',
  },
  ru: {
    label: 'Eile: правка страницы',
    manager: 'Менеджер',
    edit: 'Редактировать',
    create: 'Вложенная страница',
    open: 'Открыть в менеджере',
    hide: 'Скрыть панель',
    show: 'Показать панель Eile',
    close: 'Закрыть',
    editing: 'Правка страницы',
    creating: 'Новая вложенная страница',
    unsaved: 'Есть несохранённые правки. Закрыть без сохранения?',
  },
};

// Настройки — в атрибуте самого скрипта полосы: элемент с тем же id в тексте страницы их не подменит.
const _attribute = (value: unknown): string =>
  Bun.escapeHTML(JSON.stringify(value));

/**
 * Полоса правки на сайте, как QuickManager в Evo: видна только тому, кто вошёл в менеджер.
 * «Редактировать» и «Вложенная страница» открывают редактор менеджера в окне поверх страницы.
 */
export var defineEditBar = ({
  identity,
  appearance,
}: {
  identity: IdentityService;
  appearance: AppearanceRepository;
}) => ({
  /** HTML полосы перед `</body>`; без сеанса менеджера — null, и посетитель получает обычную страницу. */
  html: (
    request: Request,
    page: { readonly id: number; readonly status: number }
  ): string | null =>
    ((user) =>
      user &&
      ((look) =>
        `<script src="${EDIT_BAR_URL}" data-eile-bar="${_attribute({
          page: page.id,
          user: user.name,
          canEdit: can(user.role, 'content.edit'),
          accent: look.accent,
          manager: '/manager/pages',
          open: `/manager/pages/${page.id}`,
          edit: `/manager/pages/${page.id}?embed`,
          create: `/manager/pages/new?parent=${page.id}&embed`,
          texts:
            _TEXTS[
              look.language ??
                managerLanguageOf(request.headers.get('accept-language'))
            ],
        })}" defer></script>`)(appearance.get(user.id) ?? DEFAULT_APPEARANCE))(
      identity.authenticate(sessionToken(request))
    ),
  /** Сам скрипт полосы. */
  script: (): Response =>
    new Response(script, {
      headers: {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    }),
});

export type EditBar = ReturnType<typeof defineEditBar>;
