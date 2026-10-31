import { currentLanguage, quoted, t } from './i18n.ts';
import type { PageRef } from './types.ts';

/** Страница в списке «где используется»: заголовок, id и пометка, если она в корзине. */
export var pageRef = (page: PageRef): string =>
  `${quoted(page.title)} (${page.id}${page.trashed ? `, ${t('pages.inTrashShort')}` : ''})`;

/** Первые пять мест, остальные числом: список не должен вытеснить смысл сообщения. */
export var places = (all: readonly string[]): string =>
  `${all.slice(0, 5).join(', ')}${all.length > 5 ? ` ${t('common.andMore', { n: all.length - 5 })}` : ''}`;

/** Дата и время для человека — одинаково во всём менеджере: «1 мар. 2027 г., 10:00», «Mar 1, 2027, 10:00 AM». */
export var moment = (iso: string): string =>
  new Date(iso)
    .toLocaleString(currentLanguage(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    .replace(/\s/g, '\u00a0')
    .replace(',\u00a0', ', ');

const _ago = () =>
  new Intl.RelativeTimeFormat(currentLanguage(), { numeric: 'auto' });

// Порог и единица: до часа — минуты, до суток — часы, до недели — дни; дальше — дата.
const _AGO_STEPS: readonly (readonly [
  number,
  number,
  Intl.RelativeTimeFormatUnit,
])[] = [
  [3600, 60, 'minute'],
  [86_400, 3600, 'hour'],
  [7 * 86_400, 86_400, 'day'],
];

/** «только что», «5 минут назад», «вчера»; старше недели — дата, как в `moment`. */
export var ago = (iso: string, now = Date.now()): string =>
  ((seconds) =>
    seconds < 45
      ? _ago().format(0, 'second')
      : ((step) =>
          step
            ? _ago().format(
                -Math.max(1, Math.round(seconds / step[1])),
                step[2]
              )
            : moment(iso))(_AGO_STEPS.find((_) => seconds < _[0])))(
    (now - Date.parse(iso)) / 1000
  );
