/**
 * Проверка сертификата на `Bun.cron` раз в час, в случайную минуту: Let's Encrypt просит не ходить к нему
 * всем разом в начале часа. Что делать — решает сервис (выпуск, продление или ничего); ошибка внутри не
 * роняет процесс. Первая проверка — сразу при старте.
 */
export var startRenewal = (check: () => Promise<unknown>) => {
  const run = (): Promise<void> =>
    check().then(
      () => undefined,
      (error) => console.error(error)
    );
  const job = Bun.cron(`${Math.floor(Math.random() * 60)} * * * *`, run);
  void run();
  return (): void => void job.stop();
};
