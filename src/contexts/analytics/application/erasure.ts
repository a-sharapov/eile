import type { ErasureOrigin } from '../domain/events.ts';
import type {
  AnalyticsCrypto,
  ErasedTally,
  ErasureLog,
  EventStore,
  PeopleIndex,
} from '../domain/ports.ts';
import { erasedSince } from '../domain/tally.ts';

/** Что стереть: события псевдонима не позже `before`; `test` — только тестовые, и без отметки удаления. */
export type ErasureRequest = {
  readonly subject: string;
  readonly before: string;
  readonly test: boolean;
  readonly origin: ErasureOrigin;
  readonly sender: string | null;
  readonly userName: string | null;
  /** Время удаления для журнала. */
  readonly at: string;
};

/**
 * Удаление истории одного человека: события от всех отправителей, его строка в людях и конфликты, строка
 * журнала удалений с отметкой — хэшем псевдонима и моментом. Без отметки повтор отправки, старый файл или
 * копия сайта вернули бы стёртое. До удаления стёртые события последних 40 суток уходят в счёт стёртого —
 * числами по суткам, отправителю и типу: сверка со сводкой отправителя не даст ложного сбоя. Вызывать внутри
 * транзакции; ответ — сколько событий стёрто.
 */
export var defineEraser =
  ({
    events,
    erasures,
    people,
    crypto,
    erased,
  }: {
    readonly events: EventStore;
    readonly erasures: ErasureLog;
    readonly people: PeopleIndex;
    readonly crypto: AnalyticsCrypto;
    readonly erased: ErasedTally;
  }) =>
  (request: ErasureRequest): number => (
    erased.erasing(
      request.subject,
      request.before,
      request.test,
      erasedSince(request.at)
    ),
    ((count) => (
      erasures.add({
        at: request.at,
        before: request.before,
        origin: request.origin,
        sender: request.sender,
        userName: request.userName,
        events: count,
        people: count > 0 ? 1 : 0,
        subjectHash: request.test ? null : crypto.hash(request.subject),
      }),
      people.fold(request.subject),
      count
    ))(events.erase(request.subject, request.before, request.test))
  );
