import type { MediaFile } from './types.ts';

export type Pick = {
  /** Только изображения: для поля image и вставки в текст. */
  readonly images: boolean;
  /** Спросить описание изображения (alt) — для вставки в текст. */
  readonly describe?: boolean;
  /** Нужный размер (картинка для соцсетей): окно предупредит о других пропорциях и малом размере. */
  readonly size?: { readonly width: number; readonly height: number };
};

export type Picked = { readonly file: MediaFile; readonly alt: string };

type Pending = Pick & { readonly resolve: (value: Picked | null) => void };

export var picker = $state<{ current: Pending | null }>({ current: null });

/** Выбор файла медиатеки; null — передумали. */
export var pickMedia = (options: Pick): Promise<Picked | null> =>
  new Promise((resolve) => (picker.current = { ...options, resolve }));

export var settlePick = (value: Picked | null): void => {
  const current = picker.current;
  picker.current = null;
  current?.resolve(value);
};
