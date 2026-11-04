// Поддельный cms для проверки install.ps1: на `version` отвечает строкой версии, на `serve` — работает, пока
// его не остановят (запущенный .exe Windows не даёт удалить).
const _RUN: Readonly<Record<string, () => unknown>> = {
  serve: () => setInterval(() => undefined, 60_000),
  _: () => console.log('Eile 9.9.9'),
};

(_RUN[process.argv[2] ?? ''] ?? _RUN._!)();
