import type { EmailSender } from '../domain/ports.ts';
import type {
  ApiEmailSettings,
  SmtpEmailSettings,
} from '../domain/settings.ts';
import { defineApiSender } from './mail-api.ts';
import { defineSmtpSender } from './smtp-client.ts';

/** Почта сайта: письмо уходит через SMTP или HTTP API — как выбрано в настройках почты. */
export var defineEmailSender = ({
  smtp = defineSmtpSender(),
  api = defineApiSender(),
}: {
  readonly smtp?: EmailSender<SmtpEmailSettings>;
  readonly api?: EmailSender<ApiEmailSettings>;
} = {}): EmailSender => ({
  send: (settings, to, item, site) =>
    settings.transport === 'smtp'
      ? smtp.send(settings, to, item, site)
      : api.send(settings, to, item, site),
  mail: (settings, mail) =>
    settings.transport === 'smtp'
      ? smtp.mail(settings, mail)
      : api.mail(settings, mail),
  probe: (settings) =>
    settings.transport === 'smtp' ? smtp.probe(settings) : api.probe(settings),
});
