import type { Database } from '../../platform/database.ts';
import { attempt } from '../../shared/kernel/errors.ts';
import type { EventBus } from '../../shared/kernel/events.ts';
import type { ContentService, Page, PageView } from '../content/index.ts';
import type { TemplateViews } from '../delivery/index.ts';
import type { DesignService } from '../design/index.ts';
import {
  type Clock,
  defineReviewService,
  type PageFacts,
} from './application/review-service.ts';
import type { LinkTarget } from './domain/share-link.ts';
import { cryptoLinkSecrets } from './infrastructure/link-secrets.ts';
import {
  defineChangeSetRepository,
  defineProposalRepository,
  defineReviewSettingsRepository,
  defineShareLinkRepository,
} from './infrastructure/sqlite-review.ts';
import {
  definePreviewHandler,
  type PreviewPage,
} from './interface/preview-handler.ts';

export type {
  Change,
  ChangeSetSummary,
  ChangeSetView,
  Decision,
  IssuedLink,
  ItemView,
  LinkView,
  Receipt,
  ReviewService,
} from './application/review-service.ts';
export type { Agent, ChangeSet, ReviewSettings } from './domain/change-set.ts';
export type { ReviewEvent } from './domain/events.ts';
export type {
  ElementKind,
  Operation,
  Proposal,
  Value,
} from './domain/proposal.ts';
export type { LinkTarget } from './domain/share-link.ts';
export type { DiffLine } from './domain/text-diff.ts';
export {
  REVIEW_SERVER_TABLES,
  reviewMigrations,
} from './infrastructure/migrations.ts';
export {
  PREVIEW_PREFIX,
  type PreviewPage,
} from './interface/preview-handler.ts';

// Свойства страницы, которые правит агент: их нынешние значения — база предложения и его конфликты.
const _KEYS = [
  'kind',
  'title',
  'longTitle',
  'menuTitle',
  'description',
  'introText',
  'alias',
  'template',
  'contentType',
  'content',
  'linkTo',
  'publishAt',
  'unpublishAt',
  'menuIndex',
  'hiddenFromMenu',
  'cacheable',
  'searchable',
  'socialImage',
  'language',
  'translationOf',
] as const satisfies readonly (keyof Page)[];

const _facts = (page: Page, path: string): PageFacts => ({
  changes: Object.fromEntries(_KEYS.map((_) => [_, page[_]] as const)),
  fields: page.fields,
  parentId: page.parentId,
  published: page.published,
  trashed: page.trashedAt !== null,
  title: page.title,
  path,
});

/**
 * Контекст review: ссылки предпросмотра черновиков и проверка правок агентов — наборы предложений,
 * их сравнение, предпросмотр, решение человека (ADR 0054).
 */
export var defineReview = ({
  db,
  bus,
  clock,
  content,
  design,
  preview,
  siteLanguage,
}: {
  db: Database;
  bus: EventBus;
  clock: Clock;
  content: ContentService;
  design: DesignService;
  /** Рендер страницы мимо кэша; `views` — шаблоны и компоненты из предложений. */
  preview: (
    page: PageView,
    options?: { readonly views?: TemplateViews }
  ) => Promise<{ body: string; contentType: string }>;
  siteLanguage: () => string;
}) => {
  const service = defineReviewService({
    sets: defineChangeSetRepository(db),
    proposals: defineProposalRepository(db),
    links: defineShareLinkRepository(db),
    settings: defineReviewSettingsRepository(db),
    secrets: cryptoLinkSecrets,
    sources: {
      page: (id) =>
        attempt(
          () =>
            _facts(
              content.drafts.page(id),
              content.drafts.view(id)?.path ?? ''
            ),
          () => null
        ),
      element: (kind, name) =>
        ((element) =>
          element && { revision: element.revision, source: element.source })(
          design.elements.get(kind, name)
        ),
      checkPage: (draft) => void content.pages.simulate(draft),
      checkElement: design.elements.check,
      fieldLabel: (name) =>
        content.fields.list().find((_) => _.name === name)?.label || name,
    },
    clock,
    bus,
    transaction: (run) => db.transaction(run)(),
  });

  // Страница ссылки: черновик как есть или страница с правками набора; поисковикам — noindex.
  const render = (target: LinkTarget): Promise<PreviewPage | null> =>
    Promise.resolve(target).then((_) =>
      ((shown) =>
        shown === null
          ? null
          : preview(
              { ...shown.view, searchable: false },
              shown.views ? { views: shown.views } : {}
            ).then((page) => ({
              ...page,
              language: shown.view.language || siteLanguage(),
              proposed: _.changeSet !== null,
            })))(
        _.changeSet === null
          ? ((view) =>
              view === null || content.drafts.page(_.page).trashedAt !== null
                ? null
                : { view, views: null })(content.drafts.view(_.page))
          : ((overlay) =>
              ((draft) =>
                ((view) =>
                  view && {
                    view,
                    views:
                      overlay.elements.size > 0
                        ? design.views.withSources(overlay.elements)
                        : null,
                  })(
                  draft
                    ? content.pages.simulate(draft)
                    : content.drafts.view(_.page)
                ))(overlay.pages.get(_.page)))(
              service.changeSets.overlay(_.changeSet)
            )
      )
    );

  return {
    ...service,
    preview: {
      /** Страница ссылки или набора — для менеджера и `/_cms/preview/<токен>`. */
      render,
      /** `/_cms/preview/<токен>`; `client` — адрес посетителя для счёта поисков. */
      handle: definePreviewHandler({
        resolve: service.links.resolve,
        render,
        language: siteLanguage,
      }),
    },
  };
};

export type Review = ReturnType<typeof defineReview>;
