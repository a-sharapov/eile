import { attempt, fail } from '../../../shared/kernel/errors.ts';

const _LOOPBACK = /^(?:localhost|.+\.localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i;

const _url = (raw: string): URL | null =>
  attempt(
    () => new URL(raw.trim()),
    () => null
  );

/**
 * Адрес годится, чтобы брать с него выпуски и файлы: https, а http — только на этой машине (localhost,
 * 127.0.0.0/8, [::1]) или с явным разрешением (`CMS_RELEASES_INSECURE=1`). По http файл и его сумму
 * подменит любой на пути.
 */
export var safeSource = (url: URL, insecure: boolean): boolean =>
  url.protocol === 'https:' ||
  (url.protocol === 'http:' && (insecure || _LOOPBACK.test(url.hostname)));

/**
 * `CMS_RELEASES_URL` — свой адрес API релизов вместо `https://api.github.com`: зеркало, сеть без выхода
 * наружу, проверка обновления без пересборки. Ответ — адрес без `/` на конце, к нему дописывается
 * `/repos/<owner>/<name>/releases`.
 */
export var parseReleasesUrl = (raw: string, insecure = false): string =>
  ((url) =>
    url === null || !['http:', 'https:'].includes(url.protocol)
      ? fail(
          'upkeep.invalid_releases_url',
          `CMS_RELEASES_URL is not an http(s) address: ${raw}`
        )
      : url.username !== '' ||
          url.password !== '' ||
          url.search !== '' ||
          url.hash !== ''
        ? fail(
            'upkeep.invalid_releases_url',
            'CMS_RELEASES_URL takes no user, password, query or fragment'
          )
        : !safeSource(url, insecure)
          ? fail(
              'upkeep.insecure_releases_url',
              `CMS_RELEASES_URL must be https, or http on this machine: ${url.origin}`
            )
          : `${url.origin}${url.pathname.replace(/\/+$/, '')}`)(_url(raw));

/** Файл выпуска можно скачивать с этого адреса: те же правила, что у ленты. */
export var safeDownload = (raw: string, insecure = false): boolean =>
  ((url) => url !== null && safeSource(url, insecure))(_url(raw));
