import { describe, expect, it } from 'bun:test';
import {
  type Challenge,
  challengeText,
  PROOF_LIMITS,
  parseSolution,
  type Solution,
} from '../domain/proof.ts';
import { PROOF_SOLVER, PROOF_WORKER_SCRIPT } from './enhance.ts';
import { defineProofs } from './proofs.ts';

type Solver = {
  readonly proofSearch: (
    salt: string,
    challenge: string,
    from: number,
    to: number
  ) => number;
  readonly proofTask: (text: string) => {
    readonly salt: string;
    readonly max: number;
    readonly challenge: string;
  } | null;
};

// Решатель — тот же текст, что уходит в браузер: исполняем его здесь как есть.
const solver = new Function(
  `${PROOF_SOLVER}\nreturn { proofSearch, proofTask };`
)() as Solver;

const sha256 = (text: string): string =>
  new Bun.CryptoHasher('sha256').update(text).digest('hex');

const _SECRET = 'q'.repeat(43);
const _STAMP = 's'.repeat(86);

const setup = (start = Date.UTC(2026, 10, 3, 10)) => {
  let now = start;
  return {
    proofs: defineProofs(
      () => _SECRET,
      () => new Date(now)
    ),
    later: (ms: number) => void (now += ms),
  };
};

const solved = (challenge: Challenge): Solution => ({
  ...challenge,
  number: solver.proofSearch(
    challenge.salt,
    challenge.hash,
    0,
    challenge.max + 1
  ),
});

describe('решатель задачи (код браузера)', () => {
  it('SHA-256 одного блока совпадает с Bun на границах длины числа и соли', () => {
    const cases = ['', 'a', 'AbCdEfGhIjKlMn_-', 'Q'.repeat(32)].flatMap(
      (salt) =>
        [0, 9, 10, 99, 100, 65_535, 999_999, 1_000_000, 9_999_999].map(
          (n) => [salt, n] as const
        )
    );
    cases.forEach(({ 0: salt, 1: n }) => {
      expect(solver.proofSearch(salt, sha256(`${salt}${n}`), n, n + 1)).toBe(n);
      expect(
        solver.proofSearch(salt, sha256(`${salt}${n}`), n + 1, n + 50)
      ).toBe(-1);
    });
  });

  it('находит секретное число перебором с нуля', () => {
    const salt = 'AbCdEfGhIjKlMn_-';
    expect(solver.proofSearch(salt, sha256(`${salt}31337`), 0, 50_001)).toBe(
      31_337
    );
  });

  it('задачу из атрибута читает только SHA-256 своего вида', () => {
    const text = `SHA-256.AbCdEfGhIjKlMn_-.50000.1800000000000.${'a'.repeat(64)}.${'b'.repeat(43)}`;
    expect(solver.proofTask(text)).toMatchObject({
      salt: 'AbCdEfGhIjKlMn_-',
      max: 50_000,
      challenge: 'a'.repeat(64),
    });
    expect(solver.proofTask(text.replace('SHA-256', 'SHA-1'))).toBeNull();
    expect(solver.proofTask(`${text}.5`)).toBeNull();
    expect(solver.proofTask('')).toBeNull();
  });

  it('воркер решателя решает задачу сообщением, как в браузере', async () => {
    const worker = new Worker(
      URL.createObjectURL(
        new Blob([PROOF_WORKER_SCRIPT], { type: 'text/javascript' })
      )
    );
    const salt = 'AbCdEfGhIjKlMn_-';
    const answer = new Promise<number>((resolve) => {
      worker.onmessage = (event) => resolve(event.data as number);
    });
    worker.postMessage({ salt, challenge: sha256(`${salt}4711`), max: 50_000 });
    expect(await answer).toBe(4711);
    const missing = new Promise<number>((resolve) => {
      worker.onmessage = (event) => resolve(event.data as number);
    });
    worker.postMessage({
      salt,
      challenge: sha256(`${salt}60000`),
      max: 50_000,
    });
    expect(await missing).toBe(-1);
    worker.terminate();
  });
});

describe('задачи сервера', () => {
  it('задача: SHA-256, соль, предел уровня, срок печати, хэш и подпись', () => {
    const { proofs } = setup();
    const challenge = proofs.issue('callback', _STAMP, 'standard');
    expect(challenge).toMatchObject({
      algorithm: 'SHA-256',
      max: PROOF_LIMITS.standard,
      expires: Date.UTC(2026, 10, 3, 10) + 24 * 60 * 60 * 1000,
    });
    expect(challenge.salt).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(challenge.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(challenge.signature).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Соль каждый раз новая: две задачи одной печати — разные.
    expect(proofs.issue('callback', _STAMP, 'standard').salt).not.toBe(
      challenge.salt
    );
  });

  it('решённая задача проходит, строка решения разбирается обратно', () => {
    const { proofs } = setup();
    const solution = solved(proofs.issue('callback', _STAMP, 'light'));
    expect(proofs.verify('callback', _STAMP, solution)).toBe('valid');
    expect(
      parseSolution(`${challengeText(solution)}.${solution.number}`)
    ).toEqual(solution);
  });

  it('секретное число не больше предела уровня', () => {
    const { proofs } = setup();
    Array.from({ length: 20 }, () =>
      solved(proofs.issue('callback', _STAMP, 'light'))
    ).forEach((_) => {
      expect(_.number).toBeGreaterThanOrEqual(0);
      expect(_.number).toBeLessThanOrEqual(PROOF_LIMITS.light);
    });
  });

  it('без записей на сервере: другой экземпляр с тем же секретом примет решение', () => {
    const first = setup();
    const solution = solved(first.proofs.issue('callback', _STAMP, 'light'));
    expect(setup().proofs.verify('callback', _STAMP, solution)).toBe('valid');
    const other = defineProofs(
      () => 'w'.repeat(43),
      () => new Date(Date.UTC(2026, 10, 3, 10))
    );
    expect(other.verify('callback', _STAMP, solution)).toBe('invalid');
  });

  it('срок: за миг до конца — проходит, в срок — истекла', () => {
    const { proofs, later } = setup();
    const solution = solved(proofs.issue('callback', _STAMP, 'light'));
    later(24 * 60 * 60 * 1000 - 1);
    expect(proofs.verify('callback', _STAMP, solution)).toBe('valid');
    later(1);
    expect(proofs.verify('callback', _STAMP, solution)).toBe('expired');
  });

  it('привязка: к другой печати и к другой форме решение не подходит', () => {
    const { proofs } = setup();
    const solution = solved(proofs.issue('callback', _STAMP, 'light'));
    expect(proofs.verify('callback', 't'.repeat(86), solution)).toBe('invalid');
    expect(proofs.verify('order', _STAMP, solution)).toBe('invalid');
  });

  it('подмена любой части задачи или неверное число — отказ', () => {
    const { proofs } = setup();
    const solution = solved(proofs.issue('callback', _STAMP, 'light'));
    const other = proofs.issue('callback', _STAMP, 'light');
    const tampered: Partial<Solution>[] = [
      { number: solution.number + 1 },
      { max: 1 },
      { salt: other.salt },
      { hash: other.hash },
      { signature: other.signature },
      { expires: solution.expires + 60_000 },
      // Чужая соль с её хэшем и числом под старой подписью тоже не проходит.
      { salt: other.salt, hash: other.hash },
    ];
    tampered.forEach((patch) => {
      expect(proofs.verify('callback', _STAMP, { ...solution, ...patch })).toBe(
        'invalid'
      );
    });
  });

  it('проверка на сервере почти ничего не стоит: один SHA-256 и один HMAC', () => {
    const { proofs } = setup();
    const solution = solved(proofs.issue('callback', _STAMP, 'light'));
    const started = performance.now();
    Array.from({ length: 1000 }).forEach(
      () => void proofs.verify('callback', _STAMP, solution)
    );
    // Тысяча проверок — меньше 100 мс даже на медленной машине CI; на рабочей — около 10 мс.
    expect(performance.now() - started).toBeLessThan(100);
  });
});
