import type { Agent } from './change-set.ts';

/** Агент отдал набор правок на проверку: владельцу сайта — уведомление. */
export type ReviewEvent = {
  readonly type: 'review.change_set_ready';
  readonly changeSetId: number;
  readonly title: string;
  readonly agent: Agent;
  /** Сколько предложений ждут решения. */
  readonly proposals: number;
};
