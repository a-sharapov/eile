import type { Database } from '../../platform/database.ts';
import { attempt, fail } from '../../shared/kernel/errors.ts';
import type { EventBus } from '../../shared/kernel/events.ts';
import type { Report } from '../../shared/kernel/report.ts';
import {
  defineFormsService,
  type FormsPorts,
} from './application/forms-service.ts';
import { htmlMarkup } from './infrastructure/html-markup.ts';
import { defineProofs } from './infrastructure/proofs.ts';
import {
  defineFileRepository,
  defineFormRepository,
  defineSecret,
  defineSecretStore,
  defineSubmissionRepository,
  defineWebhookRepository,
} from './infrastructure/sqlite-forms.ts';
import { defineStamps } from './infrastructure/stamps.ts';
import { postWebhook } from './infrastructure/webhook-client.ts';
import { defineFormsHandler } from './interface/forms-handler.ts';

export type {
  FormPage,
  FormRequest,
  FormSummary,
  FormsService,
  SubmitResult,
  TrustedOptions,
  TrustedResult,
} from './application/forms-service.ts';
export type { Letter } from './domain/confirmation.ts';
export type {
  Channel,
  Confirmation,
  Form,
  FormInput,
  FormsEvent,
  Webhook,
} from './domain/form.ts';
export type { InboxStats, SubmissionQuery } from './domain/ports.ts';
export type { ProofLevel } from './domain/proof.ts';
export type { FieldSpec, Value } from './domain/schema.ts';
export type { SourceChoice } from './domain/sources.ts';
export type {
  Notice,
  Submission,
  SubmissionStatus,
} from './domain/submission.ts';
export type { WebhookDelivery } from './domain/webhook.ts';
export {
  FORMS_SERVER_TABLES,
  formsMigrations,
} from './infrastructure/migrations.ts';
export { FORMS_PREFIX } from './interface/forms-handler.ts';

const _log = (error: unknown): void => console.error(error);

// Секрет печатей — 32 байта в base64url (sqlite-forms `defineSecret`).
const _STAMP_SECRET = /^[A-Za-z0-9_-]{43,}={0,2}$/;

// Секрет вебхука: 32 случайных байта в hex; ключ HMAC — сама эта строка, приёмнику ничего не декодировать.
const _secret = (): string =>
  crypto.getRandomValues(new Uint8Array(32)).toHex();

/** Контекст forms: формы как HTML, приём заявок, их хранение и обработка. */
export var defineForms = ({
  db,
  bus,
  clock,
  site,
  pages,
  notify,
  mail,
  noticeLanguage,
  report,
  accepted,
}: Pick<
  FormsPorts,
  | 'bus'
  | 'clock'
  | 'site'
  | 'pages'
  | 'notify'
  | 'mail'
  | 'noticeLanguage'
  | 'accepted'
> & {
  db: Database;
  report: Report;
}) => {
  let kick = (): void => undefined;
  const stampSecret = defineSecret(db);
  const service = defineFormsService({
    forms: defineFormRepository(db),
    submissions: defineSubmissionRepository(db),
    files: defineFileRepository(db),
    markup: htmlMarkup,
    stamps: defineStamps(stampSecret, clock),
    proofs: defineProofs(stampSecret, clock),
    bus,
    clock,
    site,
    pages,
    notify,
    noticeLanguage,
    mail,
    webhooks: defineWebhookRepository(db),
    post: postWebhook,
    secret: _secret,
    report,
    kick: () => kick(),
    accepted,
  });
  // Ошибка внутри задания Bun.cron без перехвата завершила бы сервер.
  const drain = (): Promise<void> =>
    service.webhooks.run().then(() => undefined, _log);
  const secretStore = defineSecretStore(db);
  return {
    ...service,
    handle: defineFormsHandler(service, () => site().url, report),
    /** Секрет печатей форм — для файла настроек сервера: форма, открытая до переезда, примется и после. */
    serverSettings: {
      read: (): { readonly secret: string } | null =>
        ((secret) => (secret === null ? null : { secret }))(secretStore.read()),
      apply: (value: unknown): void =>
        ((secret) =>
          typeof secret === 'string' && _STAMP_SECRET.test(secret)
            ? secretStore.write(secret)
            : fail('forms.invalid_settings', 'The stamp secret is not valid'))(
          (value as { secret?: unknown } | null)?.secret
        ),
    },
    /**
     * Фон у сервера: чистка по сроку хранения раз в сутки, очередь вебхуков — раз в минуту и сразу после
     * заявки. Команды CLI и тесты гоняют очередь сами.
     */
    start: (): (() => void) => {
      const jobs = [
        Bun.cron('@daily', () =>
          attempt(service.purge, (error) => (_log(error), 0))
        ),
        Bun.cron('* * * * *', drain),
      ];
      kick = () => queueMicrotask(() => void drain());
      // То, что накопилось, пока сервер стоял, — сразу.
      void drain();
      return () => (
        jobs.forEach((_) => void _.stop()), (kick = () => undefined)
      );
    },
  };
};

export type Forms = ReturnType<typeof defineForms>;
