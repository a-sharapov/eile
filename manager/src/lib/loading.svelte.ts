import { describeLoad } from './notices.svelte.ts';

export type Load = {
  readonly state: { readonly ready: boolean; readonly error: string | null };
  /** Загрузить (или снова, после ошибки). */
  readonly retry: () => Promise<void>;
};

/**
 * Загрузка раздела с тремя состояниями — загружается, не загрузилось, готово. Без неё упавший
 * запрос выглядел как пустой раздел: «В медиатеке пока пусто», когда сервер просто не ответил.
 */
export var defineLoad = (run: () => Promise<unknown>): Load => {
  const state = $state<{ ready: boolean; error: string | null }>({
    ready: false,
    error: null,
  });
  return {
    state,
    retry: () => (
      (state.error = null),
      run().then(
        () => void (state.ready = true),
        (error) => void (state.error = describeLoad(error))
      )
    ),
  };
};
