import { describe, expect, it } from 'bun:test';
import { HONEYPOT } from '../domain/form.ts';
import type { FormView } from '../domain/ports.ts';
import { checkValues, formTextsFor, MIN_TODAY } from '../domain/schema.ts';
import { decodeEntities, fieldsOf, htmlMarkup, sentOf } from './html-markup.ts';

// Форма, какой её собирает редактор блоков: обёртки data-field, подписи, правила HTML5.
const _SOURCE = `<h3>Оставьте заявку</h3>
<div class="field" data-field="text" data-label="Имя">
  <label for="f-name">Имя</label>
  <input id="f-name" name="name" type="text" required maxlength="100" placeholder="Иван">
</div>
<div class="field" data-field="tel" data-label="Телефон" data-message="Нужен телефон: +7…">
  <label for="f-phone">Телефон</label>
  <input id="f-phone" name="phone" type="tel" required pattern="\\+?[0-9 \\(\\)\\-]{10,}">
</div>
<div class="field" data-field="select" data-label="Тема">
  <label for="f-topic">Тема</label>
  <select id="f-topic" name="topic"><option value="">Выберите…</option><option value="site">Сайт</option><option value="shop">Магазин &amp; склад</option></select>
</div>
<fieldset class="field" data-field="radio">
  <legend>Как связаться</legend>
  <label><input type="radio" name="way" value="call" checked> Звонок</label>
  <label><input type="radio" name="way" value="tg"> Telegram</label>
</fieldset>
<fieldset class="field" data-field="checkbox" data-label="Интересы">
  <legend>Интересы</legend>
  <label><input type="checkbox" name="topics" value="a"> Дизайн</label>
  <label><input type="checkbox" name="topics" value="b"> Код</label>
</fieldset>
<div class="field" data-field="textarea" data-label="Комментарий">
  <label for="f-text">Комментарий</label>
  <textarea id="f-text" name="text" maxlength="2000"></textarea>
</div>
<div class="field field-consent" data-field="consent" data-label="Согласие">
  <label><input type="checkbox" name="consent" value="yes" required> Согласен с <a href="/policy">политикой</a></label>
</div>
<input type="hidden" name="utm" data-source="utm">
<input type="hidden" name="product" data-source="page.title">`;

describe('поля по HTML формы', () => {
  const fields = fieldsOf(_SOURCE);

  it('имена, виды, подписи и правила HTML5', () => {
    expect(fields.map((_) => [_.name, _.kind, _.label, _.required])).toEqual([
      ['name', 'text', 'Имя', true],
      ['phone', 'tel', 'Телефон', true],
      ['topic', 'select', 'Тема', false],
      ['way', 'radio', 'Как связаться', false],
      ['topics', 'checkbox', 'Интересы', false],
      ['text', 'textarea', 'Комментарий', false],
      ['consent', 'consent', 'Согласие', true],
      ['utm', 'hidden', 'utm', false],
      ['product', 'hidden', 'product', false],
    ]);
    expect(fields[0]).toMatchObject({ maxLength: 100 });
    expect(fields[1]).toMatchObject({
      pattern: '\\+?[0-9 \\(\\)\\-]{10,}',
      message: 'Нужен телефон: +7…',
    });
  });

  it('варианты: значение и подпись, сущности раскрыты, пустой вариант отброшен', () => {
    expect(fields[2]!.options).toEqual([
      { value: 'site', label: 'Сайт' },
      { value: 'shop', label: 'Магазин & склад' },
    ]);
    expect(fields[3]!.options).toEqual([
      { value: 'call', label: 'Звонок' },
      { value: 'tg', label: 'Telegram' },
    ]);
    expect(fields[4]).toMatchObject({ multiple: true });
    expect(fields[8]).toMatchObject({ source: 'page.title' });
  });

  it('без обёрток подпись — из <label for>, aria-label или placeholder', () => {
    expect(
      fieldsOf(
        '<label for="e">Почта</label><input id="e" name="email" type="email"><input name="q" placeholder="Вопрос">'
      ).map((_) => [_.name, _.kind, _.label])
    ).toEqual([
      ['email', 'email', 'Почта'],
      ['q', 'text', 'Вопрос'],
    ]);
  });

  it('кнопки — не поля; файл — поле с типами, пределом и условием', () => {
    expect(
      fieldsOf('<button name="b">x</button><input type="submit" name="s">')
    ).toEqual([]);
    expect(
      fieldsOf(
        '<div data-field="file" data-show-if="need=yes|maybe"><label for="f">Скан</label><input id="f" type="file" name="f" accept=".PDF, image/*" data-max-size="99" multiple></div>'
      )
    ).toMatchObject([
      {
        name: 'f',
        kind: 'file',
        label: 'Скан',
        multiple: true,
        accept: ['.pdf', 'image/*'],
        // Больше потолка не бывает.
        maxSize: 20 * 1024 * 1024,
        showIf: { field: 'need', values: ['yes', 'maybe'] },
      },
    ]);
  });

  it('скрытое поле: подписи из data-labels — его варианты, сущности раскрыты; у других полей — только как записано', () => {
    expect(
      fieldsOf(
        '<input type="hidden" name="paket" data-source="query:paket" data-label="Paket" data-labels="berater=KI-Küchenberater | planung=KI-Küchenberater &amp; KI-Planung">'
      )
    ).toMatchObject([
      {
        name: 'paket',
        kind: 'hidden',
        label: 'Paket',
        source: 'query:paket',
        labels:
          'berater=KI-Küchenberater | planung=KI-Küchenberater & KI-Planung',
        options: [
          { value: 'berater', label: 'KI-Küchenberater' },
          { value: 'planung', label: 'KI-Küchenberater & KI-Planung' },
        ],
      },
    ]);
    // Подписи — не варианты у поля ввода: их ловит проверка при сохранении.
    expect(
      fieldsOf('<input name="q" data-labels="a=A"><input name="r">')
    ).toMatchObject([
      { name: 'q', kind: 'text', labels: 'a=A', options: [] },
      { name: 'r', labels: null },
    ]);
    expect(
      fieldsOf('<input type="hidden" name="h" data-labels="  ">')[0]!.labels
    ).toBeNull();
  });
});

describe('форма для посетителя', () => {
  const view = (patch: Partial<FormView> = {}): FormView => ({
    name: 'callback',
    source: _SOURCE,
    submitLabel: 'Отправить',
    goal: 'lead',
    action: '/_cms/forms/callback',
    pageId: 5,
    stamp: { token: 'tok', iat: 1000 },
    utm: 'utm_source=ya',
    referrer: 'https://ya.ru/',
    message: null,
    values: {},
    errors: {},
    hidden: { utm: 'utm_source=ya', 'page.title': 'Кухни & шкафы' },
    texts: formTextsFor('ru'),
    proof: null,
    ...patch,
  });

  it('подсказка поля связана с ним всегда, а при ошибке — вместе с ошибкой', () => {
    const source = [
      '<div class="field" data-field="tel" data-label="Телефон">',
      '  <label for="f-tel">Телефон</label>',
      '  <input id="f-tel" name="tel" type="tel" required>',
      '  <small class="hint">Wir rufen an</small>',
      '</div>',
      '<div class="field" data-field="email"><input name="mail" type="email"><small class="hint" id="own">Nur für Rückfragen</small></div>',
      '<div class="field" data-field="text"><input name="plain"></div>',
      '<input type="hidden" name="page" data-source="page.title">',
    ].join('\n');
    const html = htmlMarkup.render(view({ source }));
    expect(html).toContain('aria-describedby="callback-hint-0"');
    expect(html).toContain('<small class="hint" id="callback-hint-0">');
    expect(html).toContain('aria-describedby="callback-own"');
    expect(html).toContain('<small class="hint" id="callback-own">');
    expect(html).toMatch(/<input name="plain">/);
    expect(html).not.toMatch(/name="page"[^>]*aria-describedby/);
    const failed = htmlMarkup.render(
      view({ source, values: { tel: [''] }, errors: { tel: 'Nummer fehlt' } })
    );
    expect(failed).toContain(
      'aria-invalid="true" aria-describedby="callback-hint-0 callback-err-tel"'
    );
  });

  it('форма с файлами — multipart, с шагами — тексты кнопок шагов', () => {
    const html = htmlMarkup.render(
      view({
        source:
          '<fieldset data-step="Один"><legend>Один</legend><input name="a"></fieldset><fieldset data-step="Два"><legend>Два</legend><input type="file" name="f"></fieldset>',
      })
    );
    expect(html).toContain('enctype="multipart/form-data"');
    expect(html).toContain(
      'data-next="Далее" data-back="Назад" data-progress="Шаг {n} из {m}"'
    );
    expect(htmlMarkup.render(view())).not.toContain('enctype=');
    expect(htmlMarkup.render(view())).not.toContain('data-next=');
  });

  it('обёртка, служебные поля, ловушка и кнопка', () => {
    const html = htmlMarkup.render(view());
    expect(html).toStartWith(
      '<form class="cms-form" id="form-callback" data-cms-form="callback" data-goal="lead" method="post" action="/_cms/forms/callback" data-failed='
    );
    // Тексты ошибок для скрипта и подпись ловушки — на языке страницы.
    expect(htmlMarkup.render(view({ texts: formTextsFor('en') }))).toContain(
      'data-offline="No connection to the site. Please try again."'
    );
    expect(htmlMarkup.render(view({ texts: formTextsFor('en') }))).toContain(
      '<label>Leave empty <input'
    );
    expect(html).toContain('<input type="hidden" name="_page" value="5">');
    expect(html).toContain('<input type="hidden" name="_stamp" value="tok">');
    expect(html).toContain(`name="${HONEYPOT}" tabindex="-1"`);
    expect(html).toContain(
      '<div class="field field-submit"><button type="submit">Отправить</button></div></form>'
    );
  });

  it('защита от спама: задача и строки — атрибутами, пустое поле решения, строка состояния и <noscript>', () => {
    const task = `SHA-256.${'a'.repeat(16)}.200000.1000.${'0'.repeat(64)}.${'b'.repeat(43)}`;
    const html = htmlMarkup.render(
      view({ proof: task, texts: formTextsFor('de') })
    );
    expect(html).toContain(
      `data-proof="${task}" data-proof-working="Spam-Schutz wird geprüft…" data-proof-done="Spam-Schutz bestätigt">`
    );
    expect(html).toContain('<input type="hidden" name="_proof" value="">');
    // Строка — последней в форме, после кнопки: место занято сразу, читалка услышит смену текста.
    expect(html).toEndWith(
      '</button></div><p class="cms-form-proof" role="status" aria-live="polite"><noscript><input type="hidden" name="_nojs" value="1">Ohne JavaScript kann Ihre Anfrage nicht automatisch geprüft werden, daher kann die Bearbeitung länger dauern.</noscript></p></form>'
    );
    const plain = htmlMarkup.render(view());
    expect(plain).not.toContain('data-proof');
    expect(plain).not.toContain('_proof');
    expect(plain).not.toContain('<noscript>');
  });

  it('id с префиксом формы: две формы на странице не спорят', () => {
    const html = htmlMarkup.render(view());
    expect(html).toContain('<label for="callback-f-name">');
    expect(html).toContain('id="callback-f-name"');
  });

  it('скрытые поля — из источников, с экранированием', () => {
    const html = htmlMarkup.render(view());
    expect(html).toMatch(
      /name="product" data-source="page.title" value="Кухни &amp; шкафы"/
    );
  });

  it('после неудачной отправки: значения на месте, ошибки у полей', () => {
    const html = htmlMarkup.render(
      view({
        values: {
          name: ['Иван "Грозный" <b>'],
          topic: ['shop'],
          way: ['tg'],
          topics: ['b'],
          text: ['</textarea><script>alert(1)</script>'],
        },
        errors: { phone: 'Нужен телефон: +7…' },
        message: 'Проверьте поля формы',
      })
    );
    expect(html).toContain('value="Иван &quot;Грозный&quot; &lt;b>"');
    expect(html).toMatch(/<option value="shop" selected[^>]*>/);
    expect(html).not.toMatch(/<option value="site" selected/);
    expect(html).toMatch(/value="tg" checked/);
    expect(html).not.toMatch(/value="call" checked/);
    expect(html).toMatch(/value="b" checked/);
    expect(html).toContain('&lt;/textarea&gt;&lt;script&gt;');
    expect(html).toContain(
      'aria-invalid="true" aria-describedby="callback-err-phone"'
    );
    expect(html).toContain(
      '<p class="field-error" id="callback-err-phone">Нужен телефон: +7…</p></div>'
    );
    expect(html).toContain(
      '<p class="cms-form-message" role="alert">Проверьте поля формы</p>'
    );
  });

  it('своя кнопка в исходнике — без второй; вложенный <form> снимается', () => {
    const html = htmlMarkup.render(
      view({
        source: '<form><input name="a"><button>Жду звонка</button></form>',
      })
    );
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html.match(/<form/g)).toHaveLength(1);
  });

  it('<template data-sent>: не поля, кнопка в нём не убирает кнопку отправки, id — с префиксом формы', () => {
    const source = `${_SOURCE}<template data-sent><h2 id="done" tabindex="-1">Заявка у нас</h2><div class="field" data-field="text" data-label="Ещё"><label for="more">Ещё</label><input id="more" name="more" required></div><button type="button">Ещё одну</button></template>`;
    expect(fieldsOf(source).map((_) => _.name)).not.toContain('more');
    expect(fieldsOf(source)).toEqual(fieldsOf(_SOURCE));
    const html = htmlMarkup.render(
      view({ source, errors: { more: 'Нет' }, values: { more: ['x'] } })
    );
    expect(html).toContain('<button type="submit">Отправить</button>');
    expect(html).toContain(
      '<template data-sent><h2 id="callback-done" tabindex="-1">Заявка у нас</h2>'
    );
    expect(html).toContain('<label for="callback-more">');
    expect(html).not.toContain('callback-err-more');
    expect(html).not.toContain('value="x"');
    expect(html).not.toContain('enctype');
  });

  it('после отправки без JS — разметка ответа из шаблона, без него — текст «спасибо»', () => {
    const source = `${_SOURCE}<template data-sent><p id="thanks" tabindex="-1">Перезвоним <strong>сегодня</strong></p></template><template data-sent><p>второй</p></template>`;
    expect(htmlMarkup.sent('callback', 'Спасибо!', source)).toBe(
      '<div class="cms-form cms-form-sent" id="form-callback" role="status"><p id="callback-thanks" tabindex="-1">Перезвоним <strong>сегодня</strong></p></div>'
    );
    expect(htmlMarkup.sent('callback', 'Спасибо & до связи', _SOURCE)).toBe(
      '<div class="cms-form cms-form-sent" id="form-callback" role="status"><p>Спасибо &amp; до связи</p></div>'
    );
    expect(sentOf('<template data-sent></template>', 'x-')).toBe('');
    expect(sentOf('<template><p>не ответ</p></template>', 'x-')).toBeNull();
  });

  it('стили и скрипт — в шапку страницы', () => {
    expect(htmlMarkup.head).toMatch(
      /^<style data-cms-form>[\s\S]+<\/style><script type="module" src="\/_cms\/forms\/enhance\.[a-z0-9]+\.js"><\/script>$/
    );
  });
});

it('сущности раскрываются', () => {
  expect(
    decodeEntities(
      'a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#x27; &nbsp;&unknown;'
    )
  ).toBe(`a & b <c> "d" 'e'  &unknown;`);
});

describe('data-min="today" у даты', () => {
  const source =
    '<div class="field" data-field="date"><label for="f-day">Wunschtermin</label><input id="f-day" name="day" type="date" data-min="today"></div>' +
    '<div class="field" data-field="text"><input name="note" data-min="today"></div>';
  const day = (offset: number): string =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  it('прошедший день — ошибка, сегодня и завтра — нет; у не-даты атрибут ничего не значит', () => {
    const fields = fieldsOf(source);
    expect(fields.find((_) => _.name === 'day')?.min).toBe(MIN_TODAY);
    expect(fields.find((_) => _.name === 'note')?.min).toBeNull();
    const errors = (value: string) =>
      checkValues(fields, { day: [value], note: ['x'] }, 'de').errors;
    expect(errors('2020-01-01').day).toBeDefined();
    expect(errors(day(-5)).day).toBeDefined();
    expect(errors(day(0)).day).toBeUndefined();
    expect(errors(day(1)).day).toBeUndefined();
  });
});
