import { fail } from '../../../shared/kernel/errors.ts';
import type { ProposalStatus } from './proposal.ts';

/**
 * Кто предлагает: пользователь, от чьего имени работает агент, и его ключ API (null — `cms mcp` на
 * сервере). `group` — сеанс агента или ключ: правки одного сеанса копятся в одном наборе.
 */
export type Agent = {
  readonly userId: number;
  readonly userName: string;
  readonly tokenId: number | null;
  readonly tokenName: string;
  readonly group: string;
};

/**
 * open — агент ещё добавляет правки; ready — агент отдал набор на проверку; closed — по каждому
 * предложению есть решение.
 */
export type ChangeSetStatus = 'open' | 'ready' | 'closed';

/** Набор правок агента — как pull request: правки сеанса или ключа, принимают и отклоняют их вместе или по одной. */
export type ChangeSet = {
  readonly id: number;
  readonly agent: Agent;
  readonly title: string;
  readonly description: string;
  readonly status: ChangeSetStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly submittedAt: string | null;
  readonly closedAt: string | null;
};

/** Проверка правок: всех агентов сразу или только ключей с отметкой; срок ссылок предпросмотра. */
export type ReviewSettings = {
  readonly agents: boolean;
  readonly linkDays: number;
};

export var DEFAULT_REVIEW: ReviewSettings = { agents: false, linkDays: 7 };

const _MAX_TITLE = 200;
const _MAX_DESCRIPTION = 4000;

export var parseTitle = (raw: unknown): string =>
  typeof raw === 'string' ? raw.trim().slice(0, _MAX_TITLE) : '';

export var parseDescription = (raw: unknown): string =>
  typeof raw === 'string' ? raw.trim().slice(0, _MAX_DESCRIPTION) : '';

/** Своё у агента — тот же пользователь и тот же ключ: другой ключ того же человека — другой агент. */
export var isOwn = (set: ChangeSet, agent: Agent): boolean =>
  set.agent.userId === agent.userId && set.agent.tokenId === agent.tokenId;

/** Набор закрывается, когда ждущих предложений в нём не осталось. */
export var statusAfter = (
  set: ChangeSet,
  statuses: readonly ProposalStatus[]
): ChangeSetStatus =>
  statuses.some((_) => _ === 'pending')
    ? set.status === 'closed'
      ? 'ready'
      : set.status
    : 'closed';

export var parseReviewSettings = (
  input: Readonly<Record<string, unknown>>,
  previous: ReviewSettings
): ReviewSettings => ({
  agents:
    input.agents === undefined
      ? previous.agents
      : typeof input.agents === 'boolean'
        ? input.agents
        : fail('review.invalid_settings', 'agents must be true or false'),
  linkDays:
    input.linkDays === undefined
      ? previous.linkDays
      : Number.isSafeInteger(input.linkDays) &&
          Number(input.linkDays) >= 1 &&
          Number(input.linkDays) <= 90
        ? Number(input.linkDays)
        : fail('review.invalid_settings', 'linkDays must be 1–90'),
});
