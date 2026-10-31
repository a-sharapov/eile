import { api } from './api.ts';
import { ask } from './dialog.svelte.ts';
import { pageRef } from './format.ts';
import { quoted, t } from './i18n.ts';
import { notify } from './notices.svelte.ts';
import type { FormSummary, PageRef } from './types.ts';

// Список форм — для фильтра заявок и блока «Форма» в контенте; меняется только при их правке.
export var forms = $state<{ items: FormSummary[] | null }>({ items: null });

export var loadForms = (): Promise<FormSummary[]> =>
  api.get<FormSummary[]>('/forms').then((_) => ((forms.items = _), _));

/**
 * Удалить форму после подтверждения. Если тег формы стоит на страницах — диалог их называет: там форма
 * пропадёт. Ответ — удалена ли.
 */
export var removeForm = (form: {
  readonly name: string;
  readonly title: string;
}): Promise<boolean> =>
  api
    .get<{ pages: PageRef[] }>(`/forms/${form.name}/usage`)
    .then(({ pages }) =>
      ask({
        title: `${t('formEditor.removeTitle')} ${quoted(form.title)}`,
        body: t(
          pages.length > 0
            ? 'formEditor.removeUsedBody'
            : 'formEditor.removeBody'
        ),
        items: pages.length > 0 ? pages.map(pageRef) : undefined,
        confirm: t('formEditor.remove'),
        tone: 'danger',
      })
    )
    .then((confirmed) =>
      confirmed === null
        ? false
        : api
            .send('DELETE', `/forms/${form.name}`)
            .then(() => loadForms())
            .then(() => (notify(t('forms.removed')), true))
    );
