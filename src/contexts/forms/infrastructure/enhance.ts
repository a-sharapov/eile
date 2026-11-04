import script from './enhance.client.js' with { type: 'text' };
import solver from './proof.client.js' with { type: 'text' };
import worker from './proof-worker.client.js' with { type: 'text' };

/** Решатель задачи защиты форм (ADR 0053) — тот же текст в скрипте форм, в воркере и в тестах. */
export var PROOF_SOLVER: string = solver;

/** Воркер решателя: решатель и обработчик сообщения. */
export var PROOF_WORKER_SCRIPT = `${solver}\n${worker}`;

/** Адрес воркера с хэшем содержимого: тот же сайт — воркер разрешён и при `script-src 'self'`. */
export var PROOF_WORKER_URL = `/_cms/forms/proof.${Bun.hash(PROOF_WORKER_SCRIPT).toString(36)}.js`;

/** Скрипт улучшения форм для браузера: обычный JS, в бинарник — строкой; впереди — адрес воркера и решатель. */
export var ENHANCE_SCRIPT: string = `const PROOF_WORKER_URL = ${JSON.stringify(PROOF_WORKER_URL)};\n${solver}\n${script}`;

/** Адрес скрипта с хэшем содержимого: кэшируется браузером навсегда. */
export var ENHANCE_URL = `/_cms/forms/enhance.${Bun.hash(ENHANCE_SCRIPT).toString(36)}.js`;
