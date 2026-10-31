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

/** Адрес API релизов GitHub; тесты подставляют свой сервер. */
export var GITHUB_API = 'https://api.github.com';

const _release = (_: GithubRelease): Release => ({
  version: _.tag_name.replace(/^v/, ''),
  url: _.html_url,
  draft: _.draft,
  assets: (_.assets ?? []).map((asset) => ({
    name: asset.name,
    url: asset.browser_download_url,
  })),
});

/**
 * Список выпусков со страницы релизов. Уходит только обычный GET: адрес репозитория и User-Agent с
 * версией программы (без него GitHub отвечает 403) — ни адреса сайта, ни чего-то о нём.
 */
export var defineReleases =
  ({
    base = GITHUB_API,
    repository,
    version,
  }: {
    base?: string;
    repository: string;
    version: string;
  }): ReleaseSource =>
  () =>
    fetch(`${base}/repos/${repository}/releases?per_page=30`, {
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
