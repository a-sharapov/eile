// Улучшение форм сайта в браузере: без него форма работает обычной отправкой с переходом.
// Отправка без перезагрузки, ошибки у полей, новая печать после устаревшей, черновик, первое касание UTM,
// условные поля, шаги и решение задачи защиты от спама. PROOF_WORKER_URL, proofSearch и proofTask стоят в
// начале этого файла: их подставляет enhance.ts.
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

// Для условий файл считается заполнением поля: «показать, если приложили файл».
const shownValuesOf = (form) =>
  [...new FormData(form)].reduce((all, [name, value]) => {
    const text =
      typeof value === 'string' ? value : value.size > 0 ? value.name : '';
    return { ...all, [name]: [...(all[name] ?? []), text] };
  }, {});

const conditionOf = (raw) => {
  const at = raw.indexOf('=');
  return at < 0
    ? { field: raw.trim(), values: [] }
    : {
        field: raw.slice(0, at).trim(),
        values: raw
          .slice(at + 1)
          .split('|')
          .map((_) => _.trim())
          .filter(Boolean),
      };
};

// Условное поле прячется, а его элементы выключаются: required скрытого поля не мешает отправке, а
// выключенное поле не уходит на сервер. Поле, которого нет в форме, условия не скрывает — как на сервере.
const conditions = (form) => {
  const wrappers = [...form.querySelectorAll('[data-show-if]')];
  // Условие стоит на обёртке поля или на самом поле: выключается всё, что внутри, и оно само.
  const controlsOf = (wrapper) =>
    wrapper.matches('input, select, textarea')
      ? [wrapper]
      : wrapper.querySelectorAll('input, select, textarea');
  const update = () => {
    // Проходы, пока что-то меняется: поле может зависеть от поля, которое само зависит от другого.
    for (
      let pass = 0, changed = true;
      changed && pass < wrappers.length + 1;
      pass++
    ) {
      changed = false;
      const values = shownValuesOf(form);
      for (const wrapper of wrappers) {
        const { field, values: wanted } = conditionOf(wrapper.dataset.showIf);
        const given = (values[field] ?? []).filter((_) => _.trim() !== '');
        const shown =
          !form.elements.namedItem(field) ||
          (wanted.length === 0
            ? given.length > 0
            : given.some((_) => wanted.includes(_)));
        if (wrapper.hidden !== !shown) changed = true;
        wrapper.hidden = !shown;
        for (const control of controlsOf(wrapper)) control.disabled = !shown;
      }
    }
  };
  if (wrappers.length > 0) {
    update();
    form.addEventListener('input', update);
    form.addEventListener('change', update);
  }
};

const button = (text, className) => {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = className;
  node.textContent = text;
  return node;
};

// Шаги: один fieldset на экране; «Далее» проверяет поля шага, отправка — на последнем. Без скрипта
// форма видна целиком.
const steps = (form) => {
  const list = [...form.querySelectorAll('fieldset[data-step]')];
  if (list.length < 2) {
    return {
      reveal: () => {},
      advance: () => false,
      valid: () => checkFields(form, form, () => {}),
    };
  }
  const submit =
    form.querySelector('.field-submit') ??
    form.querySelector(
      'button[type="submit"], button:not([type]), input[type="submit"]'
    );
  const progress = document.createElement('p');
  progress.className = 'form-step-progress';
  progress.setAttribute('aria-live', 'polite');
  const nav = document.createElement('div');
  nav.className = 'form-step-nav';
  const back = button(form.dataset.back || 'Back', 'back');
  const next = button(form.dataset.next || 'Next', 'next');
  // Отправка — в одном ряду с «Назад»: на последнем шаге она заменяет «Далее».
  nav.append(back, next, ...(submit ? [submit] : []));
  list[0].before(progress);
  list.at(-1).after(nav);
  let current = 0;
  const show = (index, focus) => {
    current = index;
    list.forEach((step, i) => void (step.hidden = i !== index));
    back.hidden = index === 0;
    next.hidden = index === list.length - 1;
    if (submit) submit.hidden = index !== list.length - 1;
    progress.textContent = (form.dataset.progress || '{n} / {m}')
      .replaceAll('{n}', String(index + 1))
      .replaceAll('{m}', String(list.length));
    if (focus)
      list[index]
        .querySelector('input:not([type="hidden"]), select, textarea')
        ?.focus();
  };
  const forward = () => {
    if (!checkFields(form, list[current], () => {})) return;
    save(form);
    show(current + 1, true);
  };
  next.addEventListener('click', forward);
  back.addEventListener('click', () => show(current - 1, true));
  // Ошибка в поле другого шага (сервер, флеш без JS) — открыть его шаг.
  const reveal = (element) => {
    const index = list.findIndex((_) => _.contains(element));
    if (index >= 0) show(index, false);
  };
  const failed = form.querySelector('[aria-invalid="true"]');
  show(0, false);
  if (failed) reveal(failed);
  // Enter в поле промежуточного шага — «Далее», а не отправка недозаполненной формы.
  const advance = () => {
    if (current === list.length - 1) return false;
    forward();
    return true;
  };
  // Перед отправкой — вся форма: неверное поле открывает свой шаг, ошибка — у поля.
  const valid = () => checkFields(form, form, reveal);
  return { reveal, advance, valid };
};

// Задача защиты (ADR 0053) — в воркере; нет воркера или его запретили — кусками на странице, по 12 мс между
// событиями, чтобы ввод не тормозил. Ни cookie, ни хранилища: наружу уходит только найденное число.
const PROOF_SLICE_MS = 12;

const nextTask = () =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(0);
  });

const solveHere = async (task) => {
  let size = 2000;
  for (let from = 0; from <= task.max; ) {
    const started = performance.now();
    const to = Math.min(task.max + 1, from + size);
    const found = proofSearch(task.salt, task.challenge, from, to);
    if (found >= 0) return found;
    const spent = Math.max(1, performance.now() - started);
    size = Math.max(500, Math.round((size * PROOF_SLICE_MS) / spent));
    from = to;
    await nextTask();
  }
  throw new Error('unsolved');
};

const solveInWorker = (task) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(PROOF_WORKER_URL);
    worker.onmessage = (event) => {
      worker.terminate();
      if (event.data >= 0) resolve(event.data);
      else reject(new Error('unsolved'));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      worker.terminate();
      reject(new Error('worker'));
    };
    worker.postMessage({
      salt: task.salt,
      challenge: task.challenge,
      max: task.max,
    });
  });

const solve = (task) => {
  try {
    return solveInWorker(task).catch((error) =>
      error.message === 'unsolved' ? Promise.reject(error) : solveHere(task)
    );
  } catch {
    return solveHere(task);
  }
};

// Решать начинаем при первом касании формы: к отправке число обычно готово, иначе отправка его ждёт.
// Строка состояния — role="status": читалка скажет «проверяется» и «готово», вёрстка не сдвигается.
const proof = (form) => {
  let current = null;
  const fieldOf = () =>
    form.elements.namedItem('_proof') ??
    form.appendChild(
      Object.assign(document.createElement('input'), {
        type: 'hidden',
        name: '_proof',
      })
    );
  const say = (state, text) => {
    const status = form.querySelector('.cms-form-proof');
    if (!status) return;
    status.dataset.state = state;
    status.textContent = text;
  };
  const start = () => {
    const text = form.dataset.proof;
    if (!text) return Promise.resolve();
    if (current?.text === text) return current.done;
    const task = proofTask(text);
    fieldOf().value = '';
    if (!task) return Promise.resolve();
    say('working', form.dataset.proofWorking || '');
    const done = solve(task).then(
      (number) => {
        if (form.dataset.proof !== text) return;
        fieldOf().value = `${text}.${number}`;
        say('done', form.dataset.proofDone || '');
      },
      // Не решилось — уйдёт без решения: сервер выдаст новую задачу, а не потеряет заявку.
      () => say('', '')
    );
    current = { text, done };
    return done;
  };
  // Сервер выдал новую печать и задачу к ней: прежнее решение к ней не подходит.
  const renew = (text) => {
    form.dataset.proof = text;
    current = null;
  };
  form.addEventListener('focusin', start, { once: true });
  form.addEventListener('input', start, { once: true });
  return { start, renew };
};

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
    if (!saved || element.type === 'hidden' || element.type === 'file')
      continue;
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

// Id ошибок вынимаются из aria-describedby, id подсказок остаются.
const unlink = (control, id) => {
  const rest = (control.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter((_) => _ && _ !== id && !(id === undefined && _.includes('-err-')));
  rest.length
    ? control.setAttribute('aria-describedby', rest.join(' '))
    : control.removeAttribute('aria-describedby');
};

const clearErrors = (form) => {
  for (const node of form.querySelectorAll('.field-error, .cms-form-message')) {
    node.remove();
  }
  for (const node of form.querySelectorAll('[aria-invalid]')) {
    node.removeAttribute('aria-invalid');
    unlink(node);
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
const showErrors = (form, errors, message, reveal = () => {}) => {
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
      unlink(control, id);
      control.setAttribute(
        'aria-describedby',
        [control.getAttribute('aria-describedby'), id].filter(Boolean).join(' ')
      );
    }
    const wrapper = controls[0].closest('[data-field]');
    const node = paragraph('field-error', text, id);
    wrapper ? wrapper.append(node) : controls[0].after(node);
    first ??= controls[0];
  }
  if (first) reveal(first);
  first?.focus();
};

// Проверка браузера (required, pattern, type) — но ошибка у поля, как рисует сервер, а не всплывающая
// подсказка: текст — data-message поля или обёртки, иначе сообщение браузера.
const messageOf = (control) =>
  control.dataset.message ||
  control.closest('[data-field]')?.dataset.message ||
  control.validationMessage;

const checkFields = (form, root, reveal) => {
  const errors = {};
  for (const control of root.querySelectorAll('input, select, textarea')) {
    if (!control.name || control.disabled || control.type === 'hidden')
      continue;
    if (errors[control.name] || control.checkValidity()) continue;
    errors[control.name] = messageOf(control);
  }
  clearErrors(form);
  if (Object.keys(errors).length === 0) return true;
  showErrors(form, errors, null, reveal);
  return false;
};

// Исправленное поле теряет свою ошибку сразу, не дожидаясь отправки.
const settle = (form, control) => {
  if (!control?.name || control.getAttribute('aria-invalid') !== 'true') return;
  const group = form.querySelectorAll(`[name="${CSS.escape(control.name)}"]`);
  if (![...group].every((_) => _.disabled || _.checkValidity())) return;
  const id = `${form.dataset.cmsForm}-err-${control.name}`;
  form.querySelector(`#${CSS.escape(id)}`)?.remove();
  for (const _ of group) {
    _.removeAttribute('aria-invalid');
    unlink(_, id);
  }
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

// Файлы уходят только в multipart; без файлов — JSON, как раньше.
const bodyOf = (form, fields) => {
  const files = [...form.querySelectorAll('input[type="file"]')].some(
    (_) => !_.disabled && _.files && _.files.length > 0
  );
  if (!files) {
    return {
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(fields),
    };
  }
  const data = new FormData(form);
  if (fields._utm?.[0] && !data.get('_utm')) data.set('_utm', fields._utm[0]);
  return { headers: { accept: 'application/json' }, body: data };
};

const send = async (form, retried, reveal, guard) => {
  const button = form.querySelector(
    'button[type="submit"], button:not([type])'
  );
  form.dataset.busy = '1';
  button?.setAttribute('aria-busy', 'true');
  clearErrors(form);
  await guard.start();
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
      ...bodyOf(form, fields),
      credentials: 'same-origin',
    });
    const reply = await response.json().catch(() => ({}));
    // Печать устарела (вкладку открыли вчера) или задача защиты не подошла: новая печать с задачей —
    // и та же отправка ещё раз.
    if (reply.stamp && !retried) {
      form.elements.namedItem('_stamp').value = reply.stamp.token;
      form.elements.namedItem('_iat').value = String(reply.stamp.iat);
      if (reply.proof) guard.renew(reply.proof);
      return await send(form, true, reveal, guard);
    }
    if (reply.ok) return done(form, reply);
    showErrors(
      form,
      reply.errors,
      reply.message ||
        (response.status === 413
          ? form.dataset.tooLarge || 'The files are too large.'
          : form.dataset.failed || 'The form could not be sent.'),
      reveal
    );
  } catch {
    showErrors(
      form,
      {},
      form.dataset.offline || 'No connection to the site.',
      reveal
    );
  } finally {
    delete form.dataset.busy;
    button?.removeAttribute('aria-busy');
  }
};

// data-min="today" у даты: min — сегодняшний день по часам посетителя (страница в кэше, сервер его не знает).
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

for (const form of document.querySelectorAll('form[data-cms-form]')) {
  // Со скриптом поля проверяет он сам и пишет ошибку у поля; без скрипта — подсказки браузера.
  form.noValidate = true;
  for (const input of form.querySelectorAll(
    'input[type="date"][data-min="today"]'
  )) {
    input.min = today();
  }
  restore(form);
  conditions(form);
  const { reveal, advance, valid } = steps(form);
  const guard = proof(form);
  let timer = 0;
  form.addEventListener('change', (event) => settle(form, event.target));
  form.addEventListener('input', (event) => {
    settle(form, event.target);
    clearTimeout(timer);
    timer = setTimeout(() => save(form), 400);
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (advance() || !valid()) return;
    if (!form.dataset.busy) send(form, false, reveal, guard);
  });
}
