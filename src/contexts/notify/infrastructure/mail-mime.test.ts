import { describe, expect, it } from 'bun:test';
import type { Mail, MailAttachment } from '../domain/gateway.ts';
import { mailMime, mailParts, plainOf } from './mime.ts';

const _DATE = new Date('2026-11-03T10:00:00Z');

const _MAIL: Mail = {
  from: { address: 'site@example.com', name: 'Muehlenhof' },
  to: ['a@example.com', 'b@example.com'],
  subject: 'Ihr Termin',
  html: '<p>Hallo <b>Anna</b></p><img src="cid:logo@k">',
  text: 'Hallo Anna',
  attachments: [],
};

const _LOGO: MailAttachment = {
  filename: 'logo.png',
  contentType: 'image/png',
  content: new TextEncoder().encode('png'),
  contentId: 'logo@k',
  inline: true,
};

const _PDF: MailAttachment = {
  filename: 'Angebot.pdf',
  contentType: 'application/pdf',
  content: new TextEncoder().encode('%PDF'),
  contentId: '',
  inline: false,
};

const build = (mail: Partial<Mail>, envelope = 'site@example.com') =>
  mailMime({ envelope, mail: { ..._MAIL, ...mail }, date: _DATE, id: 'm1' });

// Тела частей — base64: текст части по её заголовку Content-Type.
const partText = (mime: string, type: string): string =>
  ((match) =>
    match
      ? new TextDecoder().decode(
          Uint8Array.fromBase64(match[1]!.replace(/\r\n/g, ''))
        )
      : '')(
    new RegExp(
      `Content-Type: ${type}; charset=utf-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([A-Za-z0-9+/=\\r\\n]+?)\\r\\n--`
    ).exec(mime)
  );

describe('письмо почтового шлюза', () => {
  it('без вложений — multipart/alternative из текста и HTML', () => {
    const mime = build({});
    expect(mime).toContain('From: "Muehlenhof" <site@example.com>');
    expect(mime).toContain('To: <a@example.com>, <b@example.com>');
    expect(mime).toContain('Subject: Ihr Termin');
    expect(mime).toContain('Message-ID: <m1@example.com>');
    expect(mime).toContain(
      'Content-Type: multipart/alternative; boundary="cms-m1-a"'
    );
    expect(mime).not.toContain('multipart/mixed');
    expect(mime).not.toContain('Sender:');
    expect(partText(mime, 'text/plain')).toBe('Hallo Anna');
    expect(partText(mime, 'text/html')).toBe(_MAIL.html);
  });

  it('картинка с Content-ID — в multipart/related рядом с HTML, файл — в multipart/mixed', () => {
    const mime = build({ attachments: [_LOGO, _PDF] });
    const mixed = mime.indexOf('multipart/mixed; boundary="cms-m1-m"');
    const related = mime.indexOf('multipart/related; boundary="cms-m1-r"');
    const alternative = mime.indexOf('multipart/alternative');
    expect(mixed).toBeGreaterThan(0);
    expect(related).toBeGreaterThan(mixed);
    expect(alternative).toBeGreaterThan(related);
    expect(mime).toContain(
      'Content-Type: image/png; name="logo.png"\r\nContent-Disposition: inline; filename="logo.png"\r\nContent-ID: <logo@k>'
    );
    expect(mime).toContain(
      'Content-Disposition: attachment; filename="Angebot.pdf"'
    );
    expect(mime).toContain(new TextEncoder().encode('%PDF').toBase64());
    expect(mime.indexOf('logo.png')).toBeLessThan(mime.indexOf('--cms-m1-r--'));
    expect(mime.indexOf('Angebot.pdf')).toBeGreaterThan(
      mime.indexOf('--cms-m1-r--')
    );
    expect(mime.trimEnd().endsWith('--cms-m1-m--')).toBe(true);
  });

  it('большое вложение — base64 строками по 76 знаков, кусками, без письма одной строкой', () => {
    const content = new Uint8Array(57 * 1024 * 3 + 100).map(
      (_, i) => (i * 13) % 256
    );
    const big: MailAttachment = { ..._PDF, content };
    const pieces = Array.from(
      mailParts({
        envelope: 'site@example.com',
        mail: { ..._MAIL, attachments: [big] },
        date: _DATE,
        id: 'm1',
      }),
      (_) => (typeof _ === 'string' ? _ : new TextDecoder().decode(_))
    );
    // Кусок base64 — не больше блока в 1024 строки: вложение не собирается в одну строку.
    expect(Math.max(...pieces.map((_) => _.length))).toBeLessThanOrEqual(
      2 + 1024 * 78
    );
    const mime = build({ attachments: [big] });
    expect(pieces.join('')).toBe(mime);
    const body =
      /filename="Angebot\.pdf"\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/.exec(
        mime
      )![1]!;
    expect(
      body
        .split('\r\n')
        .every((line, k, all) =>
          k < all.length - 1 ? line.length === 76 : line.length <= 76
        )
    ).toBe(true);
    expect(Uint8Array.fromBase64(body.replace(/\r\n/g, ''))).toEqual(content);
  });

  it('только встроенные картинки — корень multipart/related', () => {
    const mime = build({ attachments: [_LOGO] });
    expect(mime).toContain(
      'MIME-Version: 1.0\r\nContent-Type: multipart/related'
    );
    expect(mime).not.toContain('multipart/mixed');
  });

  it('нет текста — он собирается из HTML; нет HTML — из текста, с экранированием', () => {
    expect(partText(build({ text: '' }), 'text/plain')).toBe('Hallo Anna');
    expect(
      partText(build({ html: '', text: 'a < b\nzwei' }), 'text/html')
    ).toBe('a &lt; b<br>\nzwei');
  });

  it('разрешённый другой отправитель — в From, почта сайта — в Sender', () => {
    const mime = build(
      { from: { address: 'info@example.com', name: '' } },
      'site@example.com'
    );
    expect(mime).toContain('From: <info@example.com>');
    expect(mime).toContain('Sender: <site@example.com>');
  });

  it('имя и тема с переводом строки не дописывают заголовков; не ASCII — словами RFC 2047', () => {
    const mime = build({
      from: { address: 'site@example.com', name: 'Küchen\r\nBcc: x@y.z' },
      subject: 'Termin\r\nBcc: x@y.z',
    });
    expect(mime).not.toMatch(/\r\nBcc:/);
    expect(mime).toContain('From: =?UTF-8?B?');
    expect(mime).toContain('Subject: Termin Bcc: x@y.z');
    expect(
      build({ from: { address: 'site@example.com', name: 'A "B"' } })
    ).toContain('From: "A \\"B\\"" <site@example.com>');
  });
});

describe('текст из HTML', () => {
  it('без стилей, скриптов и тегов; абзацы и <br> — строками; сущности — знаками', () => {
    expect(
      plainOf(
        '<html><head><style>p{}</style></head><body><p>Guten&nbsp;Tag,</p><p>A &amp; B<br>Zeile</p><script>x()</script></body></html>'
      )
    ).toBe('Guten Tag,\nA & B\nZeile');
  });
});
