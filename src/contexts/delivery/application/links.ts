import type { PageView, PublishedContent } from '../../content/index.ts';
import type { SiteSettings } from '../../site/index.ts';
import { pageUrl } from '../domain/canonical-path.ts';

const _PAGE_ID = /^[1-9]\d*$/;

/** Адрес, на который ведёт страница: свой путь или цель ссылки. null — ведёт в никуда. */
export var defineLinks = (
  content: PublishedContent,
  settings: () => SiteSettings
) => {
  const own = (page: PageView | null): string | null =>
    page && pageUrl(page, settings().homePageId);

  // Цель-id разрешается на один шаг: если это тоже ссылка, дальше её ведёт свой редирект.
  const target = (linkTo: string): string | null =>
    _PAGE_ID.test(linkTo) ? own(content.page(Number(linkTo))) : linkTo;

  return {
    urlOf: (page: PageView): string | null =>
      page.kind === 'link' ? target(page.linkTo) : own(page),
  };
};

export type Links = ReturnType<typeof defineLinks>;
