import script from './enhance.client.js' with { type: 'text' };

/** Скрипт улучшения форм для браузера: обычный JS, в бинарник — строкой. */
export var ENHANCE_SCRIPT: string = script;

/** Адрес скрипта с хэшем содержимого: кэшируется браузером навсегда. */
export var ENHANCE_URL = `/_cms/forms/enhance.${Bun.hash(script).toString(36)}.js`;
