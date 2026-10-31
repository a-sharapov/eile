import { describe, expect, it } from 'bun:test';
import { pipe } from './pipe.ts';

// Проверки типов: файл не соберётся, если вывод `pipe` разойдётся с ожидаемым.
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;
const typed = <T extends true>(): void => undefined;

describe('pipe', () => {
  it('синхронные шаги: тип каждого стыка выводится, ответ — значение', () => {
    const double = pipe(
      (_: string) => _.length,
      (_) => _ * 2
    );
    typed<Equal<typeof double, (a: string) => number>>();
    expect(double('abc')).toBe(6);
  });

  it('шаг с Promise переводит остаток на .then: следующий шаг получает значение, ответ — Promise', async () => {
    const next = pipe(
      (_: number) => Promise.resolve(_ + 1),
      (_) => String(_),
      (_) => `${_}!`
    );
    typed<Equal<ReturnType<typeof next>, Promise<string>>>();
    expect(await next(1)).toBe('2!');
  });

  it('шаг, который иногда возвращает Promise, делает ответ Promise', async () => {
    const maybe = pipe(
      (_: number) => (_ > 0 ? Promise.resolve(_) : _),
      (_) => _ + 1
    );
    typed<Equal<ReturnType<typeof maybe>, Promise<number>>>();
    expect(await maybe(1)).toBe(2);
  });

  it('any из шага не делает цепочку асинхронной', () => {
    const parsed = pipe(
      (_: string) => JSON.parse(_),
      (_) => Number(_.n)
    );
    typed<Equal<ReturnType<typeof parsed>, number>>();
    expect(parsed('{"n":3}')).toBe(3);
  });

  it('null, 0 и пустая строка идут дальше как значения', () => {
    expect(
      pipe(
        (_: number) => _ - 1,
        (_) => (_ === 0 ? '' : 'x'),
        (_) => (_ === '' ? null : _),
        (_) => _ ?? 'null дошёл'
      )(1)
    ).toBe('null дошёл');
  });

  it('первый шаг без параметра — вход void, вызов без аргумента', () => {
    expect(
      pipe(
        () => 1,
        (_) => _ + 1
      )()
    ).toBe(2);
  });

  it('в .then(pipe(…)) вход выводится из .then: первый шаг без аннотации', async () => {
    const result = Promise.resolve(2).then(
      pipe(
        (_) => {
          typed<Equal<typeof _, number>>();
          return _ + 1;
        },
        (_) => String(_)
      )
    );
    typed<Equal<typeof result, Promise<string>>>();
    expect(await result).toBe('3');
  });

  it('несовпадение типов на стыке — ошибка компиляции', () => {
    const broken = pipe(
      (_: string) => _.length,
      // @ts-expect-error второй шаг ждёт строку, а первый вернул число
      (_: string) => _.toUpperCase()
    );
    expect(typeof broken).toBe('function');
  });

  it('в .then(pipe(…)) синхронная ошибка шага становится отказом', async () => {
    const failing = Promise.resolve('x').then(
      pipe(
        (_: string) => _.length,
        (_): number => {
          throw new Error(`шаг ${_} упал`);
        }
      )
    );
    await expect(failing).rejects.toThrow('шаг 1 упал');
  });
});
