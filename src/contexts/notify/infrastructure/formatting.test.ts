import { describe, expect, it } from 'bun:test';
import { message } from '../domain/message.ts';
import { headerValue, mimeMessage, subjectOf } from './mime.ts';
import { TELEGRAM_LIMIT, telegramTexts } from './telegram-client.ts';

const _APPLICATION = message({
  topic: 'forms',
  title: 'Заявка: Обратный звонок',
  fields: [
    { label: 'Имя', value: 'Иван <script>' },
    { label: 'Телефон', value: '+7 900 000-00-00' },
  ],
  link: { label: 'Открыть заявку', url: 'https://site.ru/manager/forms#12' },
  replyTo: 'ivan@example.com',
});

describe('Telegram', () => {
  it('HTML с экранированием, ссылка и подпись сайта', () => {
    expect(telegramTexts(_APPLICATION, 'Мой сайт')).toEqual([
      [
        '<b>Заявка: Обратный звонок</b>',
        '<b>Имя:</b> Иван &lt;script&gt;',
        '<b>Телефон:</b> +7 900 000-00-00',
        '<a href="https://site.ru/manager/forms#12">Открыть заявку</a>',
        '<i>Мой сайт</i>',
      ].join('\n'),
    ]);
  });

  it('ссылка не по http(s) не выводится', () => {
    const texts = telegramTexts(
      { ..._APPLICATION, link: { label: 'x', url: 'javascript:alert(1)' } },
      ''
    );
    expect(texts.join('')).not.toContain('javascript:');
  });

  it('длинное сообщение режется на куски не длиннее предела', () => {
    const long = message({
      title: 'Много полей',
      fields: Array.from({ length: 300 }, (_, i) => ({
        label: `Поле ${i}`,
        value: 'значение '.repeat(5),
      })),
    });
    const texts = telegramTexts(long, '');
    expect(texts.length).toBeGreaterThan(1);
    expect(texts.every((_) => _.length <= TELEGRAM_LIMIT)).toBe(true);
    expect(texts.join('\n')).toContain('<b>Поле 299:</b>');
  });

  it('длинный стек укорачивается до разметки: <pre> не разрывается', () => {
    const texts = telegramTexts(
      message({ title: 'Сбой', text: 'x'.repeat(10_000), mono: true }),
      ''
    );
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('…</pre>');
  });
});

describe('письмо', () => {
  const mime = mimeMessage({
    from: 'site@example.com',
    to: ['a@example.com', 'b@example.com'],
    item: _APPLICATION,
    site: 'Мой сайт',
    date: new Date('2026-10-30T12:00:00Z'),
    id: 'abc',
  });
  const headers = mime.split('\r\n\r\n')[0]!;

  it('заголовки: адреса, тема словами RFC 2047, ответ — посетителю', () => {
    expect(headers).toContain('To: <a@example.com>, <b@example.com>');
    expect(headers).toContain('Reply-To: <ivan@example.com>');
    expect(headers).toContain('Date: Fri, 30 Oct 2026 12:00:00 +0000');
    expect(headers).toContain('Message-ID: <abc@example.com>');
    expect(headers).toMatch(/^From: =\?UTF-8\?B\?[^?]+\?= <site@example\.com>/);
    expect(headers).toContain('Subject: =?UTF-8?B?');
  });

  it('тема раскодируется обратно, слова не длиннее 75 знаков', () => {
    const subject = /Subject: ([\s\S]*?)\r\n(?=\S)/.exec(
      `${headers}\r\nX`
    )![1]!;
    const words = subject.split('\r\n ');
    expect(words.every((_) => _.length <= 75)).toBe(true);
    const decoded = words
      .map((_) =>
        new TextDecoder().decode(
          Uint8Array.fromBase64(/=\?UTF-8\?B\?(.*)\?=/.exec(_)![1]!)
        )
      )
      .join('');
    expect(decoded).toBe(subjectOf(_APPLICATION, 'Мой сайт'));
  });

  it('перевод строки в значении не добавит заголовок', () => {
    expect(headerValue('Тема\r\nBcc: evil@example.com')).not.toContain('\n');
    expect(headerValue('Plain\r\nBcc: x')).toBe('Plain Bcc: x');
  });

  it('текст и HTML — в base64 строками по 76 знаков', () => {
    const body = mime.split('\r\n\r\n').slice(1).join('\r\n\r\n');
    expect(body).toContain('Content-Type: text/plain; charset=utf-8');
    expect(body).toContain('Content-Type: text/html; charset=utf-8');
    expect(body).toContain('--cms-abc--');
    const lines = body.split('\r\n').filter((_) => /^[A-Za-z0-9+/=]+$/.test(_));
    expect(lines.every((_) => _.length <= 76)).toBe(true);
    const html = new TextDecoder().decode(
      Uint8Array.fromBase64(
        body.split('\r\n\r\n')[2]!.split('\r\n--')[0]!.replaceAll('\r\n', '')
      )
    );
    expect(html).toContain('Иван &lt;script&gt;');
  });
});

describe('важность в заголовке', () => {
  it('на языке уведомления; в очереди со старой версии — по-русски', () => {
    const item = message({ title: 'Boom', severity: 'critical' });
    expect(subjectOf({ ...item, language: 'de' }, 'Site')).toBe(
      'Kritisch: Boom — Site'
    );
    expect(subjectOf({ ...item, language: 'en' }, '')).toBe('Critical: Boom');
    expect(subjectOf(item, '')).toBe('Критично: Boom');
  });
});

describe('письмо отправителю формы', () => {
  it('тема — как её написал владелец сайта, без названия сайта; текст экранирован в HTML', () => {
    const item = message({
      topic: 'confirmation',
      title: 'Ihre Bestellung bei Mühlenhof',
      text: 'Hallo <b>Anna</b>',
    });
    expect(subjectOf(item, 'Mühlenhof')).toBe('Ihre Bestellung bei Mühlenhof');
    const mime = mimeMessage({
      from: 'shop@example.com',
      to: ['anna@example.com'],
      item,
      site: 'Mühlenhof',
      id: 'x',
    });
    expect(mime).not.toContain('Reply-To');
    expect(mime).toContain('To: <anna@example.com>');
    const html = new TextDecoder().decode(
      Uint8Array.fromBase64(
        mime.split('\r\n\r\n')[3]!.split('\r\n--')[0]!.replaceAll('\r\n', '')
      )
    );
    expect(html).toContain('Hallo &lt;b&gt;Anna&lt;/b&gt;');
  });
});
