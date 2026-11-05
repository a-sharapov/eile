// Хосты, которые сервер зовёт по настройке владельца: ИИ-эндпоинт, хранилище копий, лента релизов.
// Self-hosting — суть Eile, поэтому петлю и частные сети (LAN) не режем: там живут локальная модель и
// своё S3. Режем лишь то, что никогда не бывает легальной целью настройки, и требуем шифрования.

const _strip = (hostname: string): string =>
  hostname.replace(/[[\]]/g, '').toLowerCase();

/** Петля — эта машина: localhost, *.localhost, 127.0.0.0/8, ::1. По http сюда ходить можно. */
export var isLoopbackHost = (hostname: string): boolean =>
  ((host) =>
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    /^127(?:\.\d{1,3}){3}$/.test(host) ||
    host === '::1')(_strip(hostname));

/**
 * Link-local и облачная метадата: 169.254.0.0/16 (в том числе 169.254.169.254), fe80::/10 и
 * fd00:ec2::254. Это не сеть владельца, а путь к учётным данным облака — наведённый сюда адрес настройки
 * режем всегда.
 */
export var isLinkLocalHost = (hostname: string): boolean =>
  ((host) =>
    /^169\.254(?:\.\d{1,3}){2}$/.test(host) ||
    host.startsWith('fe80:') ||
    host === 'fd00:ec2::254')(_strip(hostname));
