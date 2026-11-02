import { headline, type Message, safeUrl } from '../domain/message.ts';

const _utf8 = new TextEncoder();

// Перевод строки в значении заголовка дописал бы свой заголовок (Bcc:) — значения в одну строку.
const _oneLine = (value: string): string =>
  value.replace(/[\r\n\t]+/g, ' ').trim();

const _ASCII = /^[\x20-\x7e]*$/;

// Кодированное слово — не длиннее 75 знаков: в base64 входит до 45 байт, кодовая точка не режется.
const _words = (value: string): string[] =>
  [...value]
    .reduce<string[][]>(
      (words, char) =>
        words.length > 0 &&
        _utf8.encode([...words.at(-1)!, char].join('')).length <= 45
          ? [...words.slice(0, -1), [...words.at(-1)!, char]]
          : [...words, [char]],
      []
    )
    .map((_) => `=?UTF-8?B?${_utf8.encode(_.join('')).toBase64()}?=`);

/** Значение заголовка: ASCII как есть, остальное — словами RFC 2047 через перенос строки с пробелом. */
export var headerValue = (value: string): string =>
  ((line) => (_ASCII.test(line) ? line : _words(line).join('\r\n ')))(
    _oneLine(value)
  );

// base64 тела строками по 76 знаков, как требует MIME.
const _body = (text: string): string =>
  (
    _utf8
      .encode(text)
      .toBase64()
      .match(/.{1,76}/g) ?? []
  ).join('\r\n');

const _html = (item: Message, site: string): string =>
  [
    '<!doctype html><html><body style="font:15px/1.5 system-ui,sans-serif;color:#1d2430">',
    `<h2 style="margin:0 0 12px;font-size:18px">${Bun.escapeHTML(headline(item))}</h2>`,
    ...(item.fields.length > 0
      ? [
          '<table cellpadding="6" style="border-collapse:collapse">',
          ...item.fields.map(
            (_) =>
              `<tr><th align="left" valign="top" style="color:#5b6472;font-weight:600">${Bun.escapeHTML(_.label)}</th><td style="white-space:pre-wrap">${Bun.escapeHTML(_.value)}</td></tr>`
          ),
          '</table>',
        ]
      : []),
    ...(item.text
      ? [
          item.mono
            ? `<pre style="white-space:pre-wrap;font-size:13px">${Bun.escapeHTML(item.text)}</pre>`
            : `<p style="white-space:pre-wrap">${Bun.escapeHTML(item.text)}</p>`,
        ]
      : []),
    ...((url) =>
      url
        ? [
            `<p><a href="${Bun.escapeHTML(url)}">${Bun.escapeHTML(item.link!.label)}</a></p>`,
          ]
        : [])(item.link && safeUrl(item.link.url)),
    ...(site ? [`<p style="color:#5b6472">— ${Bun.escapeHTML(site)}</p>`] : []),
    '</body></html>',
  ].join('\n');

const _text = (item: Message, site: string): string =>
  [
    headline(item),
    '',
    ...item.fields.map((_) => `${_.label}: ${_.value}`),
    ...(item.text ? ['', item.text] : []),
    ...((url) => (url ? ['', `${item.link!.label}: ${url}`] : []))(
      item.link && safeUrl(item.link.url)
    ),
    ...(site ? ['', `— ${site}`] : []),
  ].join('\n');

/** Тема письма: заголовок уведомления и сайт; у письма посетителю — тема, как её написал владелец сайта. */
export var subjectOf = (item: Message, site: string): string =>
  site && item.topic !== 'confirmation'
    ? `${headline(item)} — ${site}`
    : headline(item);

/**
 * Письмо целиком: заголовки и multipart/alternative из текста и HTML, оба в base64 — восьмибитные
 * строки и точки в начале строки протоколу не мешают.
 */
export var mimeMessage = ({
  from,
  to,
  item,
  site,
  date = new Date(),
  id = Bun.randomUUIDv7(),
}: {
  readonly from: string;
  readonly to: readonly string[];
  readonly item: Message;
  readonly site: string;
  readonly date?: Date;
  readonly id?: string;
}): string => {
  const boundary = `cms-${id}`;
  const domain = from.split('@')[1] ?? 'localhost';
  return [
    `From: ${site ? `${headerValue(site)} ` : ''}<${_oneLine(from)}>`,
    `To: ${to.map((_) => `<${_oneLine(_)}>`).join(', ')}`,
    ...(item.replyTo ? [`Reply-To: <${_oneLine(item.replyTo)}>`] : []),
    `Subject: ${headerValue(subjectOf(item, site))}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${id}@${_oneLine(domain)}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    _body(_text(item, site)),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    _body(_html(item, site)),
    `--${boundary}--`,
    '',
  ].join('\r\n');
};
