import type { Mail, MailAttachment } from '../domain/gateway.ts';
import { headline, type Message, safeUrl } from '../domain/message.ts';

const _utf8 = new TextEncoder();

/** Значение заголовка в одну строку: перевод строки дописал бы свой заголовок (Bcc:). */
export var oneLine = (value: string): string =>
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
    oneLine(value)
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

/** Уведомление письмом: тема, текст и HTML — те же для SMTP и для HTTP API. */
export var notificationOf = (
  item: Message,
  site: string
): {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
} => ({
  subject: subjectOf(item, site),
  text: _text(item, site),
  html: _html(item, site),
});

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
  const letter = notificationOf(item, site);
  return [
    `From: ${site ? `${headerValue(site)} ` : ''}<${oneLine(from)}>`,
    `To: ${to.map((_) => `<${oneLine(_)}>`).join(', ')}`,
    ...(item.replyTo ? [`Reply-To: <${oneLine(item.replyTo)}>`] : []),
    `Subject: ${headerValue(letter.subject)}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${id}@${oneLine(domain)}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    _body(letter.text),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    _body(letter.html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
};

/** Адрес с именем: ASCII-имя — в кавычках, остальное — словами RFC 2047. */
const _mailbox = (name: string, address: string): string =>
  ((line) =>
    line === ''
      ? `<${oneLine(address)}>`
      : `${_ASCII.test(line) ? `"${line.replace(/["\\]/g, '\\$&')}"` : headerValue(line)} <${oneLine(address)}>`)(
    oneLine(name)
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

/** HTML для письма без html: текст экранирован, переводы строк — `<br>`. */
export var htmlOf = (text: string): string =>
  Bun.escapeHTML(text).replace(/\r?\n/g, '<br>\n');

// Кусок письма: строка или байты, которые уходят в base64 строками по 76 знаков. Вложения кодируются
// по ходу отправки: в памяти нет ни их base64 целиком, ни письма одной строкой (ADR 0043).
type Piece = string | { readonly base64: Uint8Array };

const _leaf = (headers: readonly string[], body: Uint8Array): Piece[] => [
  `${headers.join('\r\n')}\r\n\r\n`,
  { base64: body },
];

const _multipart = (
  kind: 'alternative' | 'related' | 'mixed',
  boundary: string,
  parts: readonly (readonly Piece[])[]
): Piece[] => [
  `Content-Type: multipart/${kind}; boundary="${boundary}"\r\n\r\n`,
  ...parts.flatMap((_) => [`--${boundary}\r\n`, ..._, '\r\n']),
  `--${boundary}--`,
];

// Имя и тип вложения уже очищены до [A-Za-z0-9._-] и type/subtype: в кавычках им нечего ломать.
const _attachment = (file: MailAttachment): Piece[] =>
  _leaf(
    [
      `Content-Type: ${file.contentType}; name="${file.filename}"`,
      `Content-Disposition: ${file.inline ? 'inline' : 'attachment'}; filename="${file.filename}"`,
      ...(file.contentId ? [`Content-ID: <${file.contentId}>`] : []),
      'Content-Transfer-Encoding: base64',
    ],
    file.content
  );

const _textPart = (text: string, subtype: 'plain' | 'html'): Piece[] =>
  _leaf(
    [
      `Content-Type: text/${subtype}; charset=utf-8`,
      'Content-Transfer-Encoding: base64',
    ],
    _utf8.encode(text)
  );

// 57 байт — ровно строка base64 в 76 знаков: блок из 1024 строк кодируется за раз.
const _LINES = 1024;
const _BLOCK = 57 * _LINES;
const _ascii = new TextEncoder();

// base64 блока — в общий буфер, строки раздвигаются под CRLF с конца, на месте: на блок одна строка
// toBase64 и ни одной копии в байтах. Кусок годится, пока не попросили следующий.
function* _base64(bytes: Uint8Array): Generator<Uint8Array> {
  const out = new Uint8Array(2 + _LINES * 78);
  for (let at = 0; at < bytes.byteLength; at += _BLOCK) {
    const text = bytes.subarray(at, at + _BLOCK).toBase64();
    const head = at === 0 ? 0 : 2;
    const lines = Math.ceil(text.length / 76);
    out.set([13, 10]);
    _ascii.encodeInto(text, out.subarray(head));
    for (let line = lines - 1; line > 0; line--) {
      out.copyWithin(
        head + line * 78,
        head + line * 76,
        head + Math.min(text.length, (line + 1) * 76)
      );
      out.set([13, 10], head + line * 78 - 2);
    }
    yield out.subarray(0, head + text.length + 2 * (lines - 1));
  }
}

function* _flatten(pieces: readonly Piece[]): Generator<string | Uint8Array> {
  for (const piece of pieces)
    yield* typeof piece === 'string' ? [piece] : _base64(piece.base64);
}

/**
 * Письмо почтового шлюза кусками — так его пишет SMTP-клиент. Кусок — строка или base64 вложения
 * байтами: строки base64 через CRLF, без точек и без перевода строки в конце; буфер у них общий и годится
 * до следующего куска. Текст и HTML всегда оба (недостающее собирается из другого), картинки с
 * Content-ID — рядом с HTML в multipart/related, остальные вложения — в multipart/mixed. Отправитель
 * конверта — почта сайта; если в From другой разрешённый адрес, он же в Sender.
 */
export var mailParts = ({
  envelope,
  mail,
  date = new Date(),
  id = Bun.randomUUIDv7(),
}: {
  readonly envelope: string;
  readonly mail: Mail;
  readonly date?: Date;
  readonly id?: string;
}): Iterable<string | Uint8Array> => {
  const alternative = _multipart('alternative', `cms-${id}-a`, [
    _textPart(mail.text || plainOf(mail.html), 'plain'),
    _textPart(mail.html || htmlOf(mail.text), 'html'),
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
  return _flatten([
    `${[
      `From: ${_mailbox(mail.from.name, mail.from.address)}`,
      ...(mail.from.address.toLowerCase() === envelope.toLowerCase()
        ? []
        : [`Sender: <${oneLine(envelope)}>`]),
      `To: ${mail.to.map((_) => `<${oneLine(_)}>`).join(', ')}`,
      `Subject: ${headerValue(mail.subject)}`,
      `Date: ${date.toUTCString().replace('GMT', '+0000')}`,
      `Message-ID: <${id}@${oneLine(envelope.split('@')[1] ?? 'localhost')}>`,
      'MIME-Version: 1.0',
    ].join('\r\n')}\r\n`,
    ...root,
    '\r\n',
  ]);
};

const _latin1 = new TextDecoder('latin1');

/** Письмо почтового шлюза одной строкой — то же, что `mailParts`; кусок base64 читается сразу. */
export var mailMime = (options: Parameters<typeof mailParts>[0]): string =>
  Array.from(mailParts(options), (_) =>
    typeof _ === 'string' ? _ : _latin1.decode(_)
  ).join('');
