import type { CompactRun, DatabaseSpace } from './compaction.ts';
import type { OffsiteSettings, OffsiteState, RemoteCopy } from './offsite.ts';
import type { BackupFailure, BackupRun, BackupSchedule } from './schedule.ts';
import type { Release } from './version.ts';

/** Всё, что обслуживание помнит между запусками: расписание копий, их итог и проверку обновлений. */
export type UpkeepState = {
  readonly schedule: BackupSchedule;
  readonly last: BackupRun | null;
  readonly failure: BackupFailure | null;
  readonly checkUpdates: boolean;
  readonly compacted: CompactRun | null;
};

export type UpkeepRepository = {
  readonly get: () => UpkeepState;
  readonly save: (state: UpkeepState) => void;
  /** Владелец что-то сохранял: иначе `get` отдаёт умолчания. */
  readonly exists: () => boolean;
};

/** Хранилище копий вне сервера: одна строка на сервер, в копию сайта не попадает. */
export type OffsiteRepository = {
  readonly get: () => OffsiteState;
  readonly save: (state: OffsiteState) => void;
  readonly exists: () => boolean;
};

/** Копия сайта в каталог расписания: файл и размер; старые автокопии сверх `keep` удаляются. */
export type Copier = {
  readonly copy: (
    schedule: BackupSchedule,
    name: string
  ) => { readonly file: string; readonly size: number };
  /** Полный путь каталога копий — показать владельцу, куда они ложатся. */
  readonly folder: (schedule: BackupSchedule) => string;
};

/** Выпуски программы, новые первыми. */
export type ReleaseSource = () => Promise<readonly Release[]>;

/** Куда и с каким секретом ходить в хранилище. */
export type RemoteTarget = OffsiteSettings & { readonly secret: string };

/** Что видно в заголовке запечатанной копии без ключа: каким ключом она запечатана. */
export type SealedHeader = { readonly keyId: string | null };

/** Хранилище S3: копии запечатываются ключом копий по дороге туда и распечатываются по дороге обратно. */
export type RemoteStore = {
  /** Бакет отвечает, пускает с этим ключом, запись и удаление проходят. */
  readonly check: () => Promise<void>;
  /** Запечатать файл и загрузить под именем `name`; ответ — размер объекта. */
  readonly upload: (
    file: string,
    name: string,
    key: Uint8Array<ArrayBuffer>
  ) => Promise<number>;
  readonly list: () => Promise<RemoteCopy[]>;
  readonly remove: (name: string) => Promise<void>;
  /** Заголовок копии: каким ключом её открывать. */
  readonly header: (name: string) => Promise<SealedHeader>;
  /** Скачать копию и распечатать её в файл `target`. */
  readonly download: (
    name: string,
    target: string,
    key: Uint8Array<ArrayBuffer>
  ) => Promise<void>;
};

export type Remote = (target: RemoteTarget) => RemoteStore;

/** Ключ копий: новый, отпечаток и ключ восстановления, который видит владелец. */
export type BackupKeys = {
  readonly generate: () => Uint8Array<ArrayBuffer>;
  readonly id: (key: Uint8Array<ArrayBuffer>) => string;
  readonly recovery: (key: Uint8Array<ArrayBuffer>) => string;
};

/** Сжатие файла базы: сколько в нём свободно, сжать, сколько места на диске. */
export type Compactor = {
  readonly space: () => DatabaseSpace;
  /** Сжать; ответ — сколько миллисекунд шло. */
  readonly compact: () => number;
  readonly diskFree: () => number;
};
