/** Файл релиза: бинарник под платформу или SHA256SUMS. */
export type ReleaseAsset = { readonly name: string; readonly url: string };

/** Выпуск программы на странице релизов. */
export type Release = {
  /** Версия без `v`: 0.2.0, 0.1.0-alpha.2. */
  readonly version: string;
  readonly url: string;
  readonly draft: boolean;
  readonly assets: readonly ReleaseAsset[];
};

/** Есть версия новее установленной: какая и где о ней прочитать. */
export type UpdateInfo = {
  readonly current: string;
  readonly latest: string;
  readonly url: string;
};

type Parsed = {
  readonly core: readonly [number, number, number];
  readonly pre: readonly string[];
};

const _SEMVER =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;
const _NUMERIC = /^\d+$/;

export var parseVersion = (raw: string): Parsed | null =>
  ((match) =>
    match
      ? {
          core: [Number(match[1]), Number(match[2]), Number(match[3])],
          pre: match[4] ? match[4].split('.') : [],
        }
      : null)(_SEMVER.exec(raw.trim()));

export var isPrerelease = (version: string): boolean =>
  (parseVersion(version)?.pre.length ?? 0) > 0;

const _sign = (value: number): number => Math.sign(value);

// Метки пре-релиза по semver: числовые — как числа и раньше буквенных, буквенные — по ASCII,
// при равном начале короче — раньше.
const _comparePre = (a: readonly string[], b: readonly string[]): number =>
  a.length === 0 || b.length === 0
    ? _sign(b.length - a.length)
    : Array.from({ length: Math.max(a.length, b.length) }).reduce<number>(
        (result, _, index) =>
          result !== 0
            ? result
            : ((x, y) =>
                x === undefined || y === undefined
                  ? x === undefined
                    ? -1
                    : 1
                  : _NUMERIC.test(x) && _NUMERIC.test(y)
                    ? _sign(Number(x) - Number(y))
                    : _NUMERIC.test(x) !== _NUMERIC.test(y)
                      ? _NUMERIC.test(x)
                        ? -1
                        : 1
                      : x < y
                        ? -1
                        : x > y
                          ? 1
                          : 0)(a[index], b[index]),
        0
      );

/** Порядок версий по semver: -1, 0 или 1. Неразборчивая версия — старше никакой. */
export var compareVersions = (a: string, b: string): number =>
  ((x, y) =>
    x === null || y === null
      ? _sign(Number(x !== null) - Number(y !== null))
      : (x.core
          .map((part, index) => _sign(part - y.core[index]!))
          .find((_) => _ !== 0) ?? _comparePre(x.pre, y.pre)))(
    parseVersion(a),
    parseVersion(b)
  );

/**
 * Выпуск новее установленного. Пре-релизы (с меткой вроде `-alpha.2`) в счёт, только если и сама
 * программа — пре-релиз: со стабильной версии на альфу не зовём. Черновики не в счёт.
 */
export var newerRelease = (
  current: string,
  releases: readonly Release[]
): Release | null =>
  releases
    .filter(
      (_) =>
        !_.draft &&
        parseVersion(_.version) !== null &&
        (!isPrerelease(_.version) || isPrerelease(current)) &&
        compareVersions(_.version, current) > 0
    )
    .reduce<Release | null>(
      (best, _) =>
        best === null || compareVersions(_.version, best.version) > 0
          ? _
          : best,
      null
    );
