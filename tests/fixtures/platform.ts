import { expect } from 'bun:test';
import { rmSync, statSync } from 'node:fs';
import { attempt, rethrow } from '../../src/shared/kernel/errors.ts';

/** Тесты идут на Windows (CI, ADR 0049): прав POSIX там нет, открытый файл базы не удалить. */
export var WINDOWS = process.platform === 'win32';

/** Права файла POSIX — как ждёт тест; на Windows chmod меняет только «только чтение», проверять нечего. */
export var expectMode = (path: string, mode: number): void =>
  void (WINDOWS || expect(statSync(path).mode & 0o777).toBe(mode));

/** Временный каталог теста — прочь. На Windows база, которую тест не закрыл, держит файл: остаток уберёт система. */
export var removeTemp = (dir: string): void =>
  attempt(
    () => rmSync(dir, { recursive: true, force: true }),
    (error) => (WINDOWS ? undefined : rethrow(error))
  );
