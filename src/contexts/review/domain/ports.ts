import type { Agent, ChangeSet, ReviewSettings } from './change-set.ts';
import type { Proposal, ProposalBody, ProposalStatus } from './proposal.ts';
import type { LinkTarget, ShareLink } from './share-link.ts';

export type ChangeSetRepository = {
  readonly get: (id: number) => ChangeSet | null;
  /** Открытый набор агента в этом сеансе: в него ложатся следующие правки. */
  readonly openOf: (agent: Agent) => ChangeSet | null;
  readonly create: (agent: Agent, at: string) => number;
  /** Новые первыми; `closed` — закрытые, иначе ждущие решения. */
  readonly list: (closed: boolean, limit: number) => ChangeSet[];
  /** Наборы пользователя с этим ключом, новые первыми. */
  readonly of: (userId: number, tokenId: number | null) => ChangeSet[];
  readonly save: (set: ChangeSet) => void;
};

export type ProposalRepository = {
  readonly get: (id: number) => Proposal | null;
  readonly of: (setId: number) => Proposal[];
  /** Ждущее решения предложение этой цели в наборе. */
  readonly pending: (setId: number, target: string) => Proposal | null;
  readonly add: (setId: number, body: ProposalBody, at: string) => number;
  readonly update: (id: number, body: ProposalBody, at: string) => void;
  readonly decide: (
    id: number,
    status: ProposalStatus,
    by: string,
    at: string
  ) => void;
  readonly fail: (id: number, error: string) => void;
  /** Сколько предложений ждут решения во всех наборах. */
  readonly pendingCount: () => number;
};

export type ShareLinkRepository = {
  readonly bySelector: (selector: string) => ShareLink | null;
  readonly get: (id: number) => ShareLink | null;
  readonly of: (target: Partial<LinkTarget>) => ShareLink[];
  readonly add: (link: Omit<ShareLink, 'id' | 'lastUsedAt' | 'uses'>) => number;
  readonly touch: (id: number, at: string) => void;
  readonly remove: (id: number) => boolean;
  /** Ссылки, чей срок кончился до `before`: в базе их не держим. */
  readonly removeExpired: (before: string) => void;
};

export type ReviewSettingsRepository = {
  readonly get: () => ReviewSettings;
  readonly save: (settings: ReviewSettings) => void;
};

/** Секрет ссылки: выпуск, хэш и сравнение за постоянное время. */
export type LinkSecrets = {
  readonly issue: () => {
    readonly selector: string;
    readonly verifier: string;
  };
  readonly hash: (verifier: string) => string;
  readonly same: (a: string, b: string) => boolean;
};
