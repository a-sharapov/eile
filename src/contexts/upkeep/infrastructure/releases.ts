import { fail } from '../../../shared/kernel/errors.ts';
import type { ReleaseSource } from '../domain/ports.ts';
import type { Release } from '../domain/version.ts';

type GithubRelease = {
  readonly tag_name: string;
  readonly html_url: string;
  readonly draft: boolean;
  readonly assets?: readonly {
    readonly name: string;
    readonly browser_download_url: string;
  }[];
};

/** HTTP-клиент: глобальный `fetch` или подставленный тестом. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** Адрес API релизов GitHub; `CMS_RELEASES_URL` и тесты подставляют свой. */
export var GITHUB_API = 'https://api.github.com';

// Заметки о выпуске менеджер показывает ссылкой: с чужой ленты в href попадает только http(s).
const _notes = (url: unknown): string =>
  typeof url === 'string' && /^https?:\/\//i.test(url) ? url : '';

const _release = (_: GithubRelease): Release => ({
  version: String(_.tag_name).replace(/^v/, ''),
  url: _notes(_.html_url),
  draft: _.draft === true,
  assets: (_.assets ?? []).map((asset) => ({
    name: asset.name,
    url: asset.browser_download_url,
  })),
});

/**
 * Список выпусков со страницы релизов. Уходит только обычный GET: адрес репозитория и User-Agent с
 * версией программы (без него GitHub отвечает 403) — ни адреса сайта, ни чего-то о нём. `base` — уже
 * проверенный адрес (`parseReleasesUrl`).
 */
export var defineReleases =
  ({
    base = GITHUB_API,
    repository,
    version,
    fetch: get = fetch,
  }: {
    base?: string;
    repository: string;
    version: string;
    fetch?: Fetch;
  }): ReleaseSource =>
  () =>
    get(`${base}/repos/${repository}/releases?per_page=30`, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': `Eile/${version}`,
      },
      signal: AbortSignal.timeout(15_000),
    })
      .then((response) =>
        response.ok
          ? (response.json() as Promise<readonly GithubRelease[]>)
          : fail(
              'upkeep.releases_unavailable',
              `The releases page answered ${response.status}`
            )
      )
      .then((list) => (Array.isArray(list) ? list.map(_release) : []));
