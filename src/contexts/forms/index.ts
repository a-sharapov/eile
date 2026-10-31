import type { Database } from '../../platform/database.ts';
import { attempt } from '../../shared/kernel/errors.ts';
import type { EventBus } from '../../shared/kernel/events.ts';
import type { Report } from '../../shared/kernel/report.ts';
import {
  defineFormsService,
  type FormsPorts,
} from './application/forms-service.ts';
import { htmlMarkup } from './infrastructure/html-markup.ts';
import {
  defineFileRepository,
  defineFormRepository,
  defineSecret,
  defineSubmissionRepository,
} from './infrastructure/sqlite-forms.ts';
import { defineStamps } from './infrastructure/stamps.ts';
import { defineFormsHandler } from './interface/forms-handler.ts';

export type {
  FormPage,
  FormRequest,
  FormSummary,
  FormsService,
  SubmitResult,
} from './application/forms-service.ts';
export type {
  Channel,
  Form,
  FormInput,
  FormsEvent,
} from './domain/form.ts';
export type { InboxStats, SubmissionQuery } from './domain/ports.ts';
export type { FieldSpec, Value } from './domain/schema.ts';
export type { SourceChoice } from './domain/sources.ts';
export type {
  Notice,
  Submission,
  SubmissionStatus,
} from './domain/submission.ts';
export {
  FORMS_SERVER_TABLES,
  formsMigrations,
} from './infrastructure/migrations.ts';
export { FORMS_PREFIX } from './interface/forms-handler.ts';

/** Контекст forms: формы как HTML, приём заявок, их хранение и обработка. */
export var defineForms = ({
  db,
  bus,
  clock,
  site,
  pages,
  notify,
  noticeLanguage,
  report,
}: Pick<
  FormsPorts,
  'bus' | 'clock' | 'site' | 'pages' | 'notify' | 'noticeLanguage'
> & {
  db: Database;
  report: Report;
}) => {
  const service = defineFormsService({
    forms: defineFormRepository(db),
    submissions: defineSubmissionRepository(db),
    files: defineFileRepository(db),
    markup: htmlMarkup,
    stamps: defineStamps(defineSecret(db), clock),
    bus,
    clock,
    site,
    pages,
    notify,
    noticeLanguage,
  });
  return {
    ...service,
    handle: defineFormsHandler(service, () => site().url, report),
    /** Чистка по сроку хранения — раз в сутки у сервера. */
    start: (): (() => void) =>
      (
        (job) => () =>
          void job.stop()
      )(
        // Ошибка внутри задания Bun.cron без перехвата завершила бы сервер.
        Bun.cron('@daily', () =>
          attempt(service.purge, (error) => (console.error(error), 0))
        )
      ),
  };
};

export type Forms = ReturnType<typeof defineForms>;
