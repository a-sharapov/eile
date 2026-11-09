import {
  type Check,
  type FindingItem,
  finding,
} from './contexts/diagnostics/index.ts';
import type { MediaService } from './contexts/media/index.ts';
import type { ManagerLanguage } from './shared/kernel/manager-language.ts';

// Связанные папки для диагностики (ADR 0065): папки или файлов нет на диске — их адреса отвечают 404.

type Said = { readonly title: string; readonly hint: string };

type LinkedTexts = {
  readonly missing: Said;
  readonly folder: (prefix: string) => string;
};

const _TEXTS: Readonly<Record<ManagerLanguage, LinkedTexts>> = {
  en: {
    missing: {
      title: 'Files of a linked folder are missing on disk',
      hint: 'The media library lists them, but the server cannot find them: their addresses answer 404. Put the folder back where it was or run cms media link to resync it.',
    },
    folder: (prefix) => `The whole folder ${prefix}/`,
  },
  de: {
    missing: {
      title: 'Dateien eines verknüpften Ordners fehlen auf der Festplatte',
      hint: 'Die Mediathek führt sie, aber der Server findet sie nicht: Ihre Adressen antworten mit 404. Legen Sie den Ordner zurück an seinen Platz oder gleichen Sie ihn mit cms media link neu ab.',
    },
    folder: (prefix) => `Der ganze Ordner ${prefix}/`,
  },
  ru: {
    missing: {
      title: 'Файлов связанной папки нет на диске',
      hint: 'В медиатеке они есть, а сервер их не находит: их адреса отвечают 404. Верните папку на место или сверьте её командой cms media link.',
    },
    folder: (prefix) => `Вся папка ${prefix}/`,
  },
};

/** Проверка связанных папок: файлы, которых нет на диске, и папки целиком. */
export var linkedChecks = (media: MediaService): readonly Check[] => [
  {
    id: 'linked',
    run: (language) =>
      ((say) =>
        finding(
          {
            id: 'media.linked_missing',
            group: 'media',
            severity: 'error',
            ...say.missing,
          },
          media.links.gaps().flatMap((gap): FindingItem[] =>
            gap.present
              ? gap.missing.map((path) => ({
                  label: path,
                  fix: { href: `/media?file=${encodeURIComponent(path)}` },
                }))
              : [{ label: say.folder(gap.prefix), detail: gap.dir }]
          )
        ))(_TEXTS[language]),
  },
];
