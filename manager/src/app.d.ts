// Состояние записи в истории: goto(…, { state }) — page.state.
declare global {
  namespace App {
    interface PageState {
      /** После перехода — фокус в заголовок: копия страницы ждёт своего названия. */
      focusTitle?: boolean;
    }
  }
}

export {};
