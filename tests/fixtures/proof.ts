import { PROOF_SOLVER } from '../../src/contexts/forms/infrastructure/enhance.ts';

type Solver = {
  readonly proofSearch: (
    salt: string,
    challenge: string,
    from: number,
    to: number
  ) => number;
  readonly proofTask: (text: string) => {
    readonly text: string;
    readonly salt: string;
    readonly max: number;
    readonly challenge: string;
  } | null;
};

/** Решатель из скрипта форм — тот же текст, что исполняет браузер. */
export var SOLVER: Solver = new Function(
  `${PROOF_SOLVER}\nreturn { proofSearch, proofTask };`
)() as Solver;

/** Задача формы из HTML страницы: `data-proof` у `<form data-cms-form="имя">`; первой формы, если имя не дано. */
export var proofTaskOf = (html: string, form?: string): string | null =>
  ((tag) => (tag ? (/ data-proof="([^"]+)"/.exec(tag)?.[1] ?? null) : null))(
    (form
      ? new RegExp(`<form[^>]* data-cms-form="${form}"[^>]*>`).exec(html)
      : /<form[^>]* data-cms-form="[^"]+"[^>]*>/.exec(html))?.[0]
  );

/** Решение задачи строкой — как его кладёт в `_proof` скрипт формы. */
export var solveTask = (text: string): string =>
  ((task) =>
    task
      ? `${text}.${SOLVER.proofSearch(task.salt, task.challenge, 0, task.max + 1)}`
      : '')(SOLVER.proofTask(text));

/** Поле `_proof` с решением задачи формы со страницы; у формы без защиты — ничего. */
export var proofOf = (html: string, form?: string): Record<string, string[]> =>
  ((text): Record<string, string[]> =>
    text ? { _proof: [solveTask(text)] } : {})(proofTaskOf(html, form));
