/** Что текст помощи получает от страницы: какие разделы и главы показать и чем подписать клавиши. */
export type HelpProps = {
  readonly shown: (topic: string) => boolean;
  readonly chapterShown: (chapter: string) => boolean;
  /** «⌘» на Mac, иначе «Ctrl». */
  readonly mod: string;
  readonly admin: boolean;
};
