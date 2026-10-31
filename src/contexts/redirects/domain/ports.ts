import type { RedirectRule, RuleDraft } from './redirect.ts';

export type RuleRepository = {
  readonly all: () => RedirectRule[];
  readonly get: (id: number) => RedirectRule | null;
  readonly byFrom: (from: string) => RedirectRule | null;
  /** Новое правило — id из базы; правка — по id, счётчики остаются. */
  readonly insert: (draft: RuleDraft, at: string) => number;
  readonly update: (id: number, draft: RuleDraft, at: string) => void;
  readonly remove: (id: number) => void;
  readonly hit: (id: number, at: string) => void;
  /** Несколько записей одной транзакцией. */
  readonly transaction: <T>(run: () => T) => T;
};

/** Что правила знают о страницах сайта: адреса живых страниц и прежние адреса. */
export type SitePages = {
  /** Опубликованная страница по адресу; null — такой нет. */
  readonly at: (
    path: string
  ) => { readonly id: number; readonly title: string } | null;
  /** Сколько опубликованных страниц живёт под префиксом. */
  readonly under: (base: string) => number;
  /** Страница по id: опубликована ли, в корзине ли; null — такой нет. */
  readonly page: (id: number) => {
    readonly title: string;
    readonly published: boolean;
    readonly trashed: boolean;
  } | null;
  /** Страница, которая раньше жила по адресу: 301 туда сайт уже отвечает сам. */
  readonly movedFrom: (path: string) => number | null;
};
