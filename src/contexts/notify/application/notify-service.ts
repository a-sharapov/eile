import { attempt, fail } from '../../../shared/kernel/errors.ts';
import {
  type Delivery,
  failureOf,
  nextAttempt,
  type SendFailure,
} from '../domain/delivery.ts';
import {
  admit,
  EMPTY_THROTTLE,
  fingerprintOf,
  type Incident,
  type Verdict,
} from '../domain/incident.ts';
import {
  atLeast,
  type ChannelKind,
  type Message,
  message,
} from '../domain/message.ts';
import type {
  IncidentRecord,
  IncidentRepository,
  OutboxRepository,
  SettingsRepository,
  Transports,
} from '../domain/ports.ts';
import {
  type Chat,
  type NotifySettings,
  type NotifyStatus,
  parseSettings,
  statusOf,
} from '../domain/settings.ts';

/** Сайт глазами уведомлений: имя — подпись, адрес — ссылки в менеджер. */
export type SiteFacts = { readonly name: string; readonly url: string };

export type NotifyPorts = {
  readonly settings: SettingsRepository;
  readonly outbox: OutboxRepository;
  readonly incidents: IncidentRepository;
  readonly transports: Transports;
  readonly clock: () => Date;
  readonly site: () => SiteFacts;
  /** Очередь пополнилась: отправить сейчас, не дожидаясь расписания. */
  readonly kick: () => void;
};

/** Сколько строк очереди отправляется за один проход; остальные — в следующий. */
const _BATCH = 50;

/** Отправленное и журнал сбоев хранятся месяц. */
const _KEEP_MS = 30 * 24 * 60 * 60 * 1000;

const _HOLD: Verdict = { kind: 'hold' };

const _permanent = (text: string): SendFailure & Error =>
  Object.assign(new Error(text), { permanent: true, retryAfter: null });

export var defineNotifyService = ({
  settings,
  outbox,
  incidents,
  transports,
  clock,
  site,
  kick,
}: NotifyPorts) => {
  let throttle = EMPTY_THROTTLE;
  let running: Promise<number> | null = null;

  const iso = (): string => clock().toISOString();

  const recipientsOf: Readonly<
    Record<ChannelKind, (current: NotifySettings) => string[]>
  > = {
    telegram: (current) => current.telegram?.chats.map((_) => _.id) ?? [],
    email: (current) => (current.email ? [current.email.to.join(',')] : []),
  };

  /** В очередь каждому адресату каждого настроенного канала; строки очереди по id. */
  const enqueue = (
    item: Message,
    channels: readonly ChannelKind[],
    source: string | null
  ): number[] => {
    const current = settings.get();
    const ids = channels.flatMap((channel) =>
      recipientsOf[channel](current).map((recipient) =>
        outbox.add({ channel, recipient, message: item, source }, iso())
      )
    );
    void (ids.length > 0 && kick());
    return ids;
  };

  const _SEND: Readonly<
    Record<
      ChannelKind,
      (current: NotifySettings, delivery: Delivery) => Promise<void>
    >
  > = {
    telegram: (current, delivery) =>
      current.telegram
        ? transports.telegram.send(
            current.telegram,
            delivery.recipient,
            delivery.message,
            site().name
          )
        : Promise.reject(_permanent('Telegram is not configured')),
    email: (current, delivery) =>
      current.email
        ? transports.email.send(
            current.email,
            delivery.recipient.split(','),
            delivery.message,
            site().name
          )
        : Promise.reject(_permanent('Email is not configured')),
  };

  const incidentMessage = (
    incident: Incident,
    repeats: number,
    record: IncidentRecord
  ): Message =>
    message({
      topic: 'incidents',
      severity: incident.severity,
      title: incident.title,
      fields:
        repeats > 0
          ? [
              {
                label: 'Повторялось',
                value: `${repeats} раз с ${record.firstAt}`,
              },
            ]
          : [],
      text: incident.detail,
      mono: true,
      link: site().url
        ? {
            label: 'Журнал сбоев',
            url: `${site().url}/manager/settings?tab=notify`,
          }
        : null,
    });

  const _FLOOD = (): Message =>
    message({
      topic: 'incidents',
      severity: 'critical',
      title: 'Сбоев слишком много',
      text: 'До конца часа уведомления о сбоях не отправляются — смотрите журнал сбоев в менеджере.',
    });

  // Сбой отправки, сам отчёт о сбое и любая ошибка внутри не роняют того, кто сообщил.
  const report = (incident: Incident): void =>
    attempt(
      () => {
        const current = settings.get();
        const fingerprint = fingerprintOf(incident);
        const record = incidents.record(
          {
            fingerprint,
            kind: incident.kind,
            severity: incident.severity,
            title: incident.title.slice(0, 300),
            detail: incident.detail.slice(0, 4000),
          },
          iso()
        );
        const decided = atLeast(incident.severity, current.level)
          ? admit(throttle, fingerprint, clock().getTime())
          : { state: throttle, verdict: _HOLD };
        throttle = decided.state;
        const channels = current.incidents.filter(
          (_) => !(incident.avoid ?? []).includes(_)
        );
        void (
          decided.verdict.kind === 'send' &&
          enqueue(
            incidentMessage(incident, decided.verdict.repeats, record),
            channels,
            `incident:${record.id}`
          )
        );
        void (
          decided.verdict.kind === 'flood' && enqueue(_FLOOD(), channels, null)
        );
      },
      () => undefined
    );

  // Попытки кончились: о недоставленной заявке — другим каналом; о недоставленном сбое — только журнал.
  const exhausted = (delivery: Delivery, failure: SendFailure): void =>
    void (
      delivery.message.topic !== 'incidents' &&
      report({
        kind: 'notify.delivery_failed',
        severity: 'critical',
        title: `Не доставлено: ${delivery.message.title}`,
        detail: `${delivery.channel} → ${delivery.recipient}: ${failure.message}`,
        key: `notify.delivery_failed:${delivery.channel}`,
        avoid: [delivery.channel],
      })
    );

  const sent = (delivery: Delivery) => (): void =>
    outbox.mark(delivery.id, {
      status: 'sent',
      attempts: delivery.attempts + 1,
      nextAt: delivery.nextAt,
      lastError: '',
      sentAt: iso(),
    });

  const failed =
    (delivery: Delivery) =>
    (error: unknown): void => {
      const failure = failureOf(error);
      const attempts = delivery.attempts + 1;
      const next = nextAttempt(attempts, failure, clock().getTime());
      outbox.mark(delivery.id, {
        status: next === null ? 'failed' : 'pending',
        attempts,
        nextAt: next === null ? delivery.nextAt : new Date(next).toISOString(),
        lastError: failure.message,
        sentAt: null,
      });
      void (next === null && exhausted(delivery, failure));
    };

  const send = (delivery: Delivery): Promise<void> =>
    Promise.resolve(settings.get())
      .then((current) => _SEND[delivery.channel](current, delivery))
      .then(sent(delivery), failed(delivery));

  // По одной: лимиты Telegram и почтовых серверов — на частоту, а не на объём.
  const drain = (): Promise<number> =>
    Promise.resolve(outbox.due(iso(), _BATCH)).then((due) =>
      due
        .reduce<Promise<void>>(
          (chain, delivery) => chain.then(() => send(delivery)),
          Promise.resolve()
        )
        .then(() => due.length)
    );

  const savedTelegram = (input: Record<string, unknown>) =>
    ((token, proxy) =>
      token
        ? { token, proxy }
        : fail('notify.no_token', 'The bot token is required'))(
      (typeof input.token === 'string' && input.token.trim()) ||
        settings.get().telegram?.token ||
        '',
      typeof input.proxy === 'string'
        ? input.proxy.trim()
        : (settings.get().telegram?.proxy ?? '')
    );

  const testMessage = (): Message =>
    message({
      topic: 'test',
      title: 'Проверка уведомлений',
      text: `Канал настроен: сюда придут заявки и сбои сайта «${site().name}».`,
    });

  const _TEST: Readonly<Record<ChannelKind, () => Promise<void>>> = {
    telegram: () =>
      ((current) =>
        current
          ? current.chats.length > 0
            ? Promise.all(
                current.chats.map((_) =>
                  transports.telegram.send(
                    current,
                    _.id,
                    testMessage(),
                    site().name
                  )
                )
              ).then(() => undefined)
            : Promise.reject(fail('notify.no_chats', 'Add a chat first'))
          : Promise.reject(
              fail('notify.not_configured', 'Telegram is not configured')
            ))(settings.get().telegram),
    email: () =>
      ((current) =>
        current
          ? transports.email.send(
              current,
              current.to,
              testMessage(),
              site().name
            )
          : Promise.reject(
              fail('notify.not_configured', 'Email is not configured')
            ))(settings.get().email),
  };

  return {
    settings: {
      status: (): NotifyStatus => statusOf(settings.get()),
      save: (input: Record<string, unknown>): NotifyStatus =>
        ((next) => (settings.save(next), statusOf(next)))(
          parseSettings(input, settings.get())
        ),
    },
    /** Уведомление в очередь: заявка — по маршруту форм или своим каналам формы. */
    send: (
      item: Message,
      channels: readonly ChannelKind[] | null,
      source: string | null
    ): number[] => enqueue(item, channels ?? settings.get().forms, source),
    /** Тестовое сообщение сразу, мимо очереди: ошибку канала видно в форме. */
    test: (channel: ChannelKind): Promise<void> =>
      Promise.resolve()
        .then(
          () =>
            _TEST[channel]?.() ??
            fail('notify.invalid_channel', `No channel ${channel}`)
        )
        .then(undefined, (error) =>
          fail('notify.test_failed', failureOf(error).message)
        ),
    telegram: {
      me: (input: Record<string, unknown> = {}): Promise<string> =>
        Promise.resolve(input).then(savedTelegram).then(transports.telegram.me),
      /** Чаты, которые писали боту или куда его добавили: из них выбирают, куда слать. */
      chats: (input: Record<string, unknown> = {}): Promise<Chat[]> =>
        Promise.resolve(input)
          .then(savedTelegram)
          .then(transports.telegram.chats),
    },
    outbox: {
      /** Проход очереди; одновременно идёт только один. */
      run: (): Promise<number> =>
        running ??
        (running = drain().finally(() => {
          running = null;
        })),
      recent: (limit = 50): Delivery[] => outbox.recent(limit),
      bySource: outbox.bySource,
      /** Ещё раз — сейчас и с полным расписанием повторов. */
      retry: (id: number): void =>
        ((delivery) =>
          delivery
            ? (outbox.mark(id, {
                status: 'pending',
                attempts: 0,
                nextAt: iso(),
                lastError: delivery.lastError,
                sentAt: null,
              }),
              kick())
            : fail('notify.delivery_not_found', `No delivery ${id}`))(
          outbox.get(id)
        ),
    },
    incidents: {
      report,
      list: (limit = 100): IncidentRecord[] => incidents.list(limit),
    },
    /** Отправленное и журнал сбоев старше месяца. */
    purge: (): void =>
      ((before) => void (outbox.purge(before), incidents.purge(before)))(
        new Date(clock().getTime() - _KEEP_MS).toISOString()
      ),
  };
};

export type NotifyService = ReturnType<typeof defineNotifyService>;
