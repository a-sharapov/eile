/** Что текст помощи получает от страницы: какие разделы и главы показать и чем подписать клавиши. */
export type HelpProps = {
  readonly shown: (topic: string) => boolean;
  readonly chapterShown: (chapter: string) => boolean;
  /** «⌘» на Mac, иначе «Ctrl». */
  readonly mod: string;
  readonly admin: boolean;
  /** Видна ли глава «Аналитика»: право analytics.read. */
  readonly analytics: boolean;
};

// Примеры для разработчика отправителя — одни на всех языках: это код, а не текст. Ключ заведомо недействительный,
// коды — образца «Подписка».
export var EVENT_EXAMPLE = `POST /_cms/events
Authorization: Bearer evk_…
Content-Type: application/json

{
  "id": "evt_1001",
  "type": "signup",
  "at": "2026-11-24T09:15:00Z",
  "subject": "u_7f3a9c2b",
  "data": { "label": "google__search" }
}`;

export var SUMMARY_EXAMPLE = `{
  "id": "summary_2026-11-24",
  "type": "daily_summary",
  "at": "2026-11-25T03:00:00Z",
  "data": {
    "day": "2026-11-24",
    "counts": { "signup": 31, "subscription_paid": 4 },
    "revenue": { "EUR": "76.00" },
    "failed": 0,
    "version": "1.5.0"
  }
}`;
