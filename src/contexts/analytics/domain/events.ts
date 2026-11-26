/** Откуда пришло удаление истории: событием отправителя, кнопкой в менеджере или по сроку хранения. */
export type ErasureOrigin = 'event' | 'manager' | 'retention';

export type AnalyticsEvent =
  /** Выключатель приёма или срок хранения сменились. */
  | { readonly type: 'analytics.settings_changed' }
  /** Справочники сменились: люди со старой ревизией пересчитываются. */
  | { readonly type: 'analytics.setup_changed'; readonly revision: number }
  /** Выпущен ключ отправителя — для аудита, как ключ API; `userId` null — не из менеджера. */
  | {
      readonly type: 'analytics.sender_key_issued';
      readonly sender: string;
      readonly userId: number | null;
    }
  /** История стёрта; псевдонима в событии нет. */
  | {
      readonly type: 'analytics.person_erased';
      readonly origin: ErasureOrigin;
      readonly events: number;
    };
