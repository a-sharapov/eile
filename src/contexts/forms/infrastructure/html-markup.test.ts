import { describe, expect, it } from 'bun:test';
import { HONEYPOT } from '../domain/form.ts';
import type { FormView } from '../domain/ports.ts';
import { formTextsFor } from '../domain/schema.ts';
import { decodeEntities, fieldsOf, htmlMarkup } from './html-markup.ts';

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
    ...patch,
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
