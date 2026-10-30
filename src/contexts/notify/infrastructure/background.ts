import { attempt } from '../../../shared/kernel/errors.ts';

const _log = (error: unknown): void => console.error(error);

/**
 * Фоновая работа уведомлений на `Bun.cron`: очередь — раз в минуту и сразу после постановки, чистка —
 * раз в сутки. Задания не наслаиваются, а ошибка внутри не роняет процесс: отклонённый Promise в
 * задании `Bun.cron` иначе завершил бы сервер.
 */
export var startBackground = ({
  run,
  purge,
}: {
  run: () => Promise<unknown>;
  purge: () => void;
}) => {
  const drain = (): Promise<void> => run().then(() => undefined, _log);
  const jobs = [
    Bun.cron('* * * * *', drain),
    Bun.cron('@daily', () => attempt(purge, _log)),
  ];
  // То, что накопилось, пока сервер стоял, — сразу.
  void drain();
  return {
    /** Очередь пополнилась: отправить в этом же цикле событий. */
    kick: (): void => queueMicrotask(() => void drain()),
    stop: (): void => jobs.forEach((_) => void _.stop()),
  };
};
