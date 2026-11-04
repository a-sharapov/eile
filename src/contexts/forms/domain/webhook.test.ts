import { describe, expect, it } from 'bun:test';
import { isDomainError } from '../../../shared/kernel/errors.ts';
import type { Submission } from './submission.ts';
import {
  answerFailure,
  nextWebhookAttempt,
  parseWebhookUrl,
  payloadOf,
  WEBHOOK_RETRY_MS,
} from './webhook.ts';

const codeOf = (run: () => unknown): string | null => {
  try {
    run();
    return null;
  } catch (error) {
    return isDomainError(error) ? error.code : 'other';
  }
};

describe('вебхук формы', () => {
  it('адрес — https, http — только localhost и 127.0.0.1; пусто — выключен', () => {
    expect(parseWebhookUrl(' https://crm.example.com/in ')).toBe(
      'https://crm.example.com/in'
    );
    expect(parseWebhookUrl('http://127.0.0.1:9000/hook')).toBe(
      'http://127.0.0.1:9000/hook'
    );
    expect(parseWebhookUrl('http://localhost/hook')).toBe(
      'http://localhost/hook'
    );
    expect(parseWebhookUrl('')).toBe('');
    expect(codeOf(() => parseWebhookUrl('http://crm.example.com/in'))).toBe(
      'forms.invalid_webhook'
    );
    expect(codeOf(() => parseWebhookUrl('ftp://crm.example.com'))).toBe(
      'forms.invalid_webhook'
    );
    expect(codeOf(() => parseWebhookUrl('crm.example.com'))).toBe(
      'forms.invalid_webhook'
    );
    expect(
      codeOf(() => parseWebhookUrl('http://localhost.evil.example/hook'))
    ).toBe('forms.invalid_webhook');
  });

  it('тело: значения по именам, имена файлов, страница', () => {
    expect(
      payloadOf(
        {
          id: 7,
          form: 'order',
          createdAt: '2026-11-02T10:00:00.000Z',
          values: [
            { name: 'name', label: 'Name', kind: 'text', value: 'Anna' },
            { name: 'partner', label: 'p', kind: 'hidden', value: 'P-42' },
          ],
          context: {
            pageId: 3,
            pageTitle: 'Bestellen',
            url: 'https://muehlenhof.example/bestellen',
            referrer: '',
            utm: {},
          },
        },
        ['plan.pdf']
      )
    ).toEqual({
      form: 'order',
      submissionId: 7,
      receivedAt: '2026-11-02T10:00:00.000Z',
      values: { name: 'Anna', partner: 'P-42' },
      files: ['plan.pdf'],
      page: { id: 3, url: 'https://muehlenhof.example/bestellen' },
    });
  });

  describe('скрытое поле с подписями', () => {
    const submission = (values: Submission['values']) => ({
      id: 8,
      form: 'bestellung',
      createdAt: '2026-11-03T10:00:00.000Z',
      values,
      context: {
        pageId: null,
        pageTitle: '',
        url: '',
        referrer: '',
        utm: {},
      },
    });

    it('в values — ключ, как раньше; подпись — рядом, в labels', () => {
      expect(
        payloadOf(
          submission([
            {
              name: 'paket',
              label: 'Paket',
              kind: 'hidden',
              value: 'KI-Küchenberater + KI-Planung',
              raw: 'planung',
            },
            { name: 'firma', label: 'Firma', kind: 'text', value: 'Müller' },
          ]),
          []
        )
      ).toEqual({
        form: 'bestellung',
        submissionId: 8,
        receivedAt: '2026-11-03T10:00:00.000Z',
        values: { paket: 'planung', firma: 'Müller' },
        labels: { paket: 'KI-Küchenberater + KI-Planung' },
        files: [],
        page: null,
      });
    });

    it('без подписей тело то же до байта: ключа labels нет, порядок ключей прежний', () => {
      expect(
        JSON.stringify(
          payloadOf(
            submission([
              { name: 'ref', label: 'ref', kind: 'hidden', value: 'friend' },
              { name: 'topic', label: 'Thema', kind: 'select', value: 'Küche' },
            ]),
            ['plan.pdf']
          )
        )
      ).toBe(
        '{"form":"bestellung","submissionId":8,"receivedAt":"2026-11-03T10:00:00.000Z","values":{"ref":"friend","topic":"Küche"},"files":["plan.pdf"],"page":null}'
      );
    });
  });

  it('ответ: 2xx — доставлено, 5xx и 429 — повторить, редирект и 4xx — насовсем', () => {
    expect(answerFailure(204, '')).toBeNull();
    expect(answerFailure(503, 'busy')).toEqual({
      permanent: false,
      message: 'HTTP 503: busy',
    });
    expect(answerFailure(429, '')?.permanent).toBe(false);
    expect(answerFailure(404, 'no\nroute')).toEqual({
      permanent: true,
      message: 'HTTP 404: no route',
    });
    expect(answerFailure(302, '')?.permanent).toBe(true);
  });

  it('повторы: по расписанию, после последней паузы и при отказе насовсем — конец', () => {
    const temporary = { permanent: false, message: 'HTTP 500' };
    expect(nextWebhookAttempt(1, temporary, 0)).toBe(WEBHOOK_RETRY_MS[0]!);
    expect(nextWebhookAttempt(4, temporary, 10)).toBe(
      10 + WEBHOOK_RETRY_MS[3]!
    );
    expect(nextWebhookAttempt(5, temporary, 0)).toBeNull();
    expect(
      nextWebhookAttempt(1, { permanent: true, message: 'HTTP 404' }, 0)
    ).toBeNull();
  });
});
