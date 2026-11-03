import type { Mail, MailAttachment } from '../domain/gateway.ts';
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

// base64 строками по 76 знаков, как требует MIME.
const _wrapped = (bytes: Uint8Array): string =>
  (bytes.toBase64().match(/.{1,76}/g) ?? []).join('\r\n');

const _body = (text: string): string => _wrapped(_utf8.encode(text));

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

/** Адрес с именем: ASCII-имя — в кавычках, остальное — словами RFC 2047. */
const _mailbox = (name: string, address: string): string =>
  ((line) =>
    line === ''
      ? `<${_oneLine(address)}>`
      : `${_ASCII.test(line) ? `"${line.replace(/["\\]/g, '\\$&')}"` : headerValue(line)} <${_oneLine(address)}>`)(
    _oneLine(name)
  );

const _ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' ',
};

/** Текст для письма без text: HTML без стилей, скриптов и тегов, строки — по абзацам и `<br>`. */
export var plainOf = (html: string): string =>
  html
    .replace(/<(style|script|head)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(
      /&(amp|lt|gt|quot|apos|#39|nbsp);/g,
      (entity, name: string) => _ENTITIES[name] ?? entity
    )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// HTML для письма без html: текст экранирован, переводы строк — `<br>`.
const _htmlOf = (text: string): string =>
  Bun.escapeHTML(text).replace(/\r?\n/g, '<br>\n');

const _leaf = (headers: readonly string[], body: string): string =>
  [...headers, '', body].join('\r\n');

const _multipart = (
  kind: 'alternative' | 'related' | 'mixed',
  boundary: string,
  parts: readonly string[]
): string =>
  [
    `Content-Type: multipart/${kind}; boundary="${boundary}"`,
    '',
    ...parts.flatMap((_) => [`--${boundary}`, _]),
    `--${boundary}--`,
  ].join('\r\n');

// Имя и тип вложения уже очищены до [A-Za-z0-9._-] и type/subtype: в кавычках им нечего ломать.
const _attachment = (file: MailAttachment): string =>
  _leaf(
    [
      `Content-Type: ${file.contentType}; name="${file.filename}"`,
      `Content-Disposition: ${file.inline ? 'inline' : 'attachment'}; filename="${file.filename}"`,
      ...(file.contentId ? [`Content-ID: <${file.contentId}>`] : []),
      'Content-Transfer-Encoding: base64',
    ],
    _wrapped(file.content)
  );

const _textPart = (text: string, subtype: 'plain' | 'html'): string =>
  _leaf(
    [
      `Content-Type: text/${subtype}; charset=utf-8`,
      'Content-Transfer-Encoding: base64',
    ],
    _body(text)
  );

/**
 * Письмо почтового шлюза: текст и HTML всегда оба (недостающее собирается из другого), картинки с
 * Content-ID — рядом с HTML в multipart/related, остальные вложения — в multipart/mixed. Отправитель
 * конверта — почта сайта; если в From другой разрешённый адрес, он же в Sender.
 */
export var mailMime = ({
  envelope,
  mail,
  date = new Date(),
  id = Bun.randomUUIDv7(),
}: {
  readonly envelope: string;
  readonly mail: Mail;
  readonly date?: Date;
  readonly id?: string;
}): string => {
  const alternative = _multipart('alternative', `cms-${id}-a`, [
    _textPart(mail.text || plainOf(mail.html), 'plain'),
    _textPart(mail.html || _htmlOf(mail.text), 'html'),
  ]);
  const inline = mail.attachments.filter((_) => _.inline);
  const files = mail.attachments.filter((_) => !_.inline);
  const related =
    inline.length > 0
      ? _multipart('related', `cms-${id}-r`, [
          alternative,
          ...inline.map(_attachment),
        ])
      : alternative;
  const root =
    files.length > 0
      ? _multipart('mixed', `cms-${id}-m`, [related, ...files.map(_attachment)])
      : related;
  return [
    `From: ${_mailbox(mail.from.name, mail.from.address)}`,
    ...(mail.from.address.toLowerCase() === envelope.toLowerCase()
      ? []
      : [`Sender: <${_oneLine(envelope)}>`]),
    `To: ${mail.to.map((_) => `<${_oneLine(_)}>`).join(', ')}`,
    `Subject: ${headerValue(mail.subject)}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${id}@${_oneLine(envelope.split('@')[1] ?? 'localhost')}>`,
    'MIME-Version: 1.0',
    root,
    '',
  ].join('\r\n');
};
