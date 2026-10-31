import type { Form, FormName } from './form.ts';
import type { FieldSpec, FormTexts, Posted, Upload } from './schema.ts';
import type {
  NewSubmission,
  Submission,
  SubmissionStatus,
} from './submission.ts';

export type FormRepository = {
  readonly get: (name: FormName) => Form | null;
  readonly list: () => Form[];
  readonly save: (form: Form) => void;
  readonly remove: (name: FormName) => void;
};

export type SubmissionQuery = {
  readonly form?: string;
  readonly status?: SubmissionStatus;
  /** Только непрочитанные. */
  readonly unread?: boolean;
  /** Подстрока в значениях полей. */
  readonly text?: string;
  /** Раньше этой заявки — следующая страница списка. */
  readonly before?: number;
  readonly limit: number;
};

/** Сводка для конверта и мини-дашборда. */
export type InboxStats = {
  readonly unread: number;
  readonly today: number;
  readonly week: number;
  readonly byForm: readonly {
    readonly form: string;
    readonly title: string;
    readonly unread: number;
    readonly total: number;
  }[];
  /** Заявок по дням за 14 дней, последний — сегодня. */
  readonly daily: readonly number[];
};

export type SubmissionRepository = {
  readonly add: (submission: NewSubmission) => number;
  readonly get: (id: number) => Submission | null;
  readonly list: (query: SubmissionQuery) => Submission[];
  readonly save: (submission: Submission) => void;
  readonly remove: (id: number) => void;
  /** `now` — момент «сейчас», `dayStart` — начало сегодняшних суток по часам сайта. */
  readonly stats: (now: string, dayStart: string) => InboxStats;
  /** Удаляет заявки формы старше момента; без формы — заявки форм, которых больше нет. */
  readonly purge: (
    form: string | null,
    before: string,
    keep: readonly string[]
  ) => number;
};

/** Файл заявки: что прислали в поле формы. Содержимое отдаётся только менеджеру и только скачиванием. */
export type SubmissionFile = {
  readonly id: number;
  readonly submissionId: number;
  readonly field: string;
  readonly name: string;
  readonly type: string;
  readonly size: number;
};

/** Присланный файл с содержимым. */
export type UploadedFile = Upload & { readonly bytes: Uint8Array };

export type FileRepository = {
  readonly add: (
    submissionId: number,
    field: string,
    file: UploadedFile
  ) => number;
  readonly list: (submissionId: number) => SubmissionFile[];
  readonly get: (
    id: number
  ) => (SubmissionFile & { readonly bytes: Uint8Array }) | null;
  /** Удаляет файлы заявок, которых больше нет. */
  readonly removeOrphans: () => number;
};

/** Разметка формы: описание полей по её HTML и HTML для посетителя с подставленным состоянием. */
export type FormMarkup = {
  readonly fields: (source: string) => FieldSpec[];
  /** Форма для посетителя: исходник с состоянием, служебные поля и кнопка. */
  readonly render: (view: FormView) => string;
  /** Вместо формы после отправки без JS. */
  readonly sent: (name: string, text: string) => string;
  /** Стили по умолчанию и скрипт улучшения — в <head> страницы, один раз на страницу. */
  readonly head: string;
};

/** Всё, что нужно, чтобы нарисовать форму одному посетителю. */
export type FormView = {
  readonly name: string;
  readonly source: string;
  readonly submitLabel: string;
  readonly goal: string;
  readonly action: string;
  readonly pageId: number | null;
  readonly stamp: { readonly token: string; readonly iat: number };
  /** Метки UTM и откуда пришёл посетитель — контекст заявки, даже если в форме нет скрытых полей. */
  readonly utm: string;
  readonly referrer: string;
  /** Общая ошибка после неудачной отправки без JS. */
  readonly message: string | null;
  readonly values: Posted;
  readonly errors: Readonly<Record<string, string>>;
  /** Значения скрытых полей по их `data-source`. */
  readonly hidden: Readonly<Record<string, string>>;
  /** Тексты формы на языке страницы; скрипт берёт свои из атрибутов формы. */
  readonly texts: FormTexts;
};

/** Печать формы: когда её показали — подписано; одноразовая. */
export type Stamps = {
  readonly issue: (form: string) => {
    readonly token: string;
    readonly iat: number;
  };
  readonly valid: (form: string, token: unknown, iat: unknown) => boolean;
  /** Отметить использованной; false — уже была использована. */
  readonly spend: (token: string) => boolean;
};
