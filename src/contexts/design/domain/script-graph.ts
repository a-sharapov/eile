import { fail, pointAt } from '../../../shared/kernel/errors.ts';
import type { Element, ElementName } from './element.ts';

/**
 * Ссылка скрипта сайта на другой скрипт: путь `./имя.js` в импорте, `export … from`, `import()` или
 * `new URL(…, import.meta.url)`. `start` и `end` — место пути в исходнике, от кавычки до кавычки.
 */
export type ScriptReference = {
  readonly name: ElementName;
  readonly start: number;
  readonly end: number;
};

// То же правило, что у имени скрипта (`element.ts`): путь целиком, без `../`, запроса и якоря.
const _REFERENCE = /^\.\/([a-z0-9][a-z0-9-]{0,63})\.js$/;

/** Имя скрипта сайта по пути `./имя.js`; другой путь — null. */
export var referencedScript = (path: string): ElementName | null =>
  (_REFERENCE.exec(path)?.[1] as ElementName | undefined) ?? null;

/** Имена скриптов, на которые ссылается исходник, — каждое один раз, по порядку в тексте. */
export var referencedNames = (
  references: readonly ScriptReference[]
): ElementName[] => [...new Set(references.map((_) => _.name))];

/**
 * Каждый скрипт, на который ссылается сохраняемый, есть — в сайте или в том же сохранении (`exists`).
 * Ссылка на себя — не пропажа: скрипт сохраняется сейчас.
 */
export var assertReferencesExist = (
  script: Pick<Element, 'name' | 'source'>,
  references: readonly ScriptReference[],
  exists: (name: ElementName) => boolean
): void =>
  void ((missing) =>
    missing &&
    fail(
      'design.unknown_script',
      `${script.name}: there is no script "${missing.name}" for "./${missing.name}.js": save it before this one or in the same push`,
      pointAt(script.source, missing.start)
    ))(references.find((_) => _.name !== script.name && !exists(_.name)));

/**
 * Скрипты, до которых доходят ссылки от `start`, вместе с ним самим. Пропавший скрипт тоже здесь: у него
 * просто нет ссылок дальше.
 */
export var reachableScripts = (
  start: ElementName,
  referencesOf: (name: ElementName) => readonly ElementName[]
): ReadonlySet<ElementName> => {
  const visit = (
    seen: ReadonlySet<ElementName>,
    name: ElementName
  ): ReadonlySet<ElementName> =>
    seen.has(name)
      ? seen
      : referencesOf(name).reduce(visit, new Set([...seen, name]));
  return visit(new Set(), start);
};

/**
 * Компонента сильной связности: скрипты, которые доходят до `start` и до которых доходит он, по имени.
 * Без циклов это сам скрипт; `entry` → `import('./lazy.js')` и `lazy` → `import … from './entry.js'` —
 * одна компонента из двух.
 */
export var scriptComponent = (
  start: ElementName,
  reach: (name: ElementName) => ReadonlySet<ElementName>
): ElementName[] =>
  [...reach(start)]
    .filter((_) => _ === start || reach(_).has(start))
    .toSorted();

/** Скрипты из ввода — объект `{ имя: исходник }`; имена проверит сохранение. */
export var parseScriptBatch = (raw: unknown): Map<string, string> =>
  raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? new Map(
        Object.entries(raw).map(
          ({ 0: name, 1: source }) => [name, String(source ?? '')] as const
        )
      )
    : fail(
        'design.invalid_scripts',
        'scripts must be an object: script name → its source'
      );
