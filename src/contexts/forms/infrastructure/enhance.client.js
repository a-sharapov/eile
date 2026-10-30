// Улучшение форм сайта в браузере: без него форма работает обычной отправкой с переходом.
// Отправка без перезагрузки, ошибки у полей, новая печать после устаревшей, черновик, первое касание UTM.
const DRAFT = 'cms:form:';
const LANDING = 'cms:utm';

// Метки первого касания: посетитель пришёл по рекламе, а заявку оставил через три страницы.
const utm = new URLSearchParams(
  [...new URLSearchParams(location.search)].filter(([key]) =>
    key.startsWith('utm_')
  )
).toString();
try {
  if (utm && !sessionStorage.getItem(LANDING)) {
    sessionStorage.setItem(LANDING, utm);
  }
} catch {}

const valuesOf = (form) =>
  [...new FormData(form)].reduce(
    (all, [name, value]) =>
      typeof value === 'string'
        ? { ...all, [name]: [...(all[name] ?? []), value] }
        : all,
    {}
  );

// В черновик — только то, что вводил человек: скрытые и служебные поля всегда свежие с сервера.
const draftOf = (form) =>
  Object.fromEntries(
    Object.entries(valuesOf(form)).filter(
      ([name]) =>
        !name.startsWith('_') &&
        form.elements.namedItem(name)?.type !== 'hidden'
    )
  );

const restore = (form) => {
  const raw = (() => {
    try {
      return localStorage.getItem(DRAFT + form.dataset.cmsForm);
    } catch {
      return null;
    }
  })();
  const draft = raw ? JSON.parse(raw) : {};
  for (const element of form.elements) {
    const saved = draft[element.name];
    if (!saved || element.type === 'hidden') continue;
    if (element.type === 'checkbox' || element.type === 'radio') {
      element.checked = saved.includes(element.value);
    } else if (element.tagName === 'SELECT') {
      for (const option of element.options) {
        option.selected = saved.includes(option.value);
      }
    } else if (!element.value) {
      element.value = saved[0] ?? '';
    }
  }
};

const save = (form) => {
  try {
    localStorage.setItem(
      DRAFT + form.dataset.cmsForm,
      JSON.stringify(draftOf(form))
    );
  } catch {}
};

const clearErrors = (form) => {
  for (const node of form.querySelectorAll('.field-error, .cms-form-message')) {
    node.remove();
  }
  for (const node of form.querySelectorAll('[aria-invalid]')) {
    node.removeAttribute('aria-invalid');
  }
};

const paragraph = (className, text, id) => {
  const node = document.createElement('p');
  node.className = className;
  node.textContent = text;
  if (id) node.id = id;
  return node;
};

// Ошибка — у поля, как рисует сервер: в конце обёртки [data-field] или сразу после поля.
const showErrors = (form, errors, message) => {
  const name = form.dataset.cmsForm;
  if (message) {
    const box = paragraph('cms-form-message', message);
    box.setAttribute('role', 'alert');
    form.prepend(box);
  }
  let first = null;
  for (const [field, text] of Object.entries(errors ?? {})) {
    const controls = form.querySelectorAll(`[name="${CSS.escape(field)}"]`);
    if (controls.length === 0) continue;
    const id = `${name}-err-${field}`;
    for (const control of controls) {
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', id);
    }
    const wrapper = controls[0].closest('[data-field]');
    const node = paragraph('field-error', text, id);
    wrapper ? wrapper.append(node) : controls[0].after(node);
    first ??= controls[0];
  }
  first?.focus();
};

const done = (form, reply) => {
  try {
    localStorage.removeItem(DRAFT + form.dataset.cmsForm);
  } catch {}
  form.dispatchEvent(
    new CustomEvent('cms:form-sent', {
      bubbles: true,
      detail: {
        form: form.dataset.cmsForm,
        goal: form.dataset.goal || null,
      },
    })
  );
  if (reply.redirect) {
    location.assign(reply.redirect);
    return;
  }
  const sent = document.createElement('div');
  sent.className = 'cms-form cms-form-sent';
  sent.id = form.id;
  sent.setAttribute('role', 'status');
  sent.tabIndex = -1;
  sent.append(paragraph('', reply.message));
  form.replaceWith(sent);
  sent.focus();
};

const send = async (form, retried) => {
  const button = form.querySelector(
    'button[type="submit"], button:not([type])'
  );
  form.dataset.busy = '1';
  button?.setAttribute('aria-busy', 'true');
  clearErrors(form);
  const fields = valuesOf(form);
  const landing = (() => {
    try {
      return sessionStorage.getItem(LANDING);
    } catch {
      return null;
    }
  })();
  if (landing && !fields._utm?.[0]) fields._utm = [landing];
  try {
    const response = await fetch(form.action, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(fields),
      credentials: 'same-origin',
    });
    const reply = await response.json().catch(() => ({}));
    // Печать устарела (вкладку открыли вчера): новая печать — и та же отправка ещё раз.
    if (reply.stamp && !retried) {
      form.elements.namedItem('_stamp').value = reply.stamp.token;
      form.elements.namedItem('_iat').value = String(reply.stamp.iat);
      delete form.dataset.busy;
      return send(form, true);
    }
    if (reply.ok) return done(form, reply);
    showErrors(
      form,
      reply.errors,
      reply.message || 'Не удалось отправить форму.'
    );
  } catch {
    showErrors(form, {}, 'Нет связи с сайтом — попробуйте ещё раз.');
  } finally {
    delete form.dataset.busy;
    button?.removeAttribute('aria-busy');
  }
};

for (const form of document.querySelectorAll('form[data-cms-form]')) {
  restore(form);
  let timer = 0;
  form.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => save(form), 400);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.dataset.busy) send(form, false);
  });
}
