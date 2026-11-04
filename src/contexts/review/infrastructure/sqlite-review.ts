import type { Database } from '../../../platform/database.ts';
import {
  type Agent,
  type ChangeSet,
  type ChangeSetStatus,
  DEFAULT_REVIEW,
} from '../domain/change-set.ts';
import type {
  ChangeSetRepository,
  ProposalRepository,
  ReviewSettingsRepository,
  ShareLinkRepository,
} from '../domain/ports.ts';
import {
  type Proposal,
  type ProposalBody,
  type ProposalStatus,
  targetOf,
} from '../domain/proposal.ts';
import type { ShareLink } from '../domain/share-link.ts';

type SetRow = {
  id: number;
  user_id: number;
  user_name: string;
  token_id: number | null;
  token_name: string;
  agent_group: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  closed_at: string | null;
};

const _set = (row: SetRow): ChangeSet => ({
  id: row.id,
  agent: {
    userId: row.user_id,
    userName: row.user_name,
    tokenId: row.token_id,
    tokenName: row.token_name,
    group: row.agent_group,
  },
  title: row.title,
  description: row.description,
  status: row.status as ChangeSetStatus,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  submittedAt: row.submitted_at,
  closedAt: row.closed_at,
});

export var defineChangeSetRepository = (db: Database): ChangeSetRepository => {
  const byId = db.query<SetRow, [number]>(
    'SELECT * FROM review_change_sets WHERE id = ?'
  );
  const open = db.query<SetRow, [number, string]>(
    `SELECT * FROM review_change_sets WHERE user_id = ? AND agent_group = ? AND status = 'open'
     ORDER BY id DESC LIMIT 1`
  );
  const insert = db.query<
    { id: number },
    [number, string, number | null, string, string, string]
  >(
    `INSERT INTO review_change_sets
       (user_id, user_name, token_id, token_name, agent_group, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 'open', ?6, ?6) RETURNING id`
  );
  const pending = db.query<SetRow, [number]>(
    `SELECT * FROM review_change_sets WHERE status != 'closed' ORDER BY updated_at DESC, id DESC LIMIT ?`
  );
  const closed = db.query<SetRow, [number]>(
    `SELECT * FROM review_change_sets WHERE status = 'closed' ORDER BY closed_at DESC, id DESC LIMIT ?`
  );
  const of = db.query<SetRow, [number, number | null]>(
    'SELECT * FROM review_change_sets WHERE user_id = ? AND token_id IS ? ORDER BY id DESC'
  );
  const update = db.query(
    `UPDATE review_change_sets SET title = $title, description = $description, status = $status,
       updated_at = $updated, submitted_at = $submitted, closed_at = $closed WHERE id = $id`
  );
  return {
    get: (id) => ((row) => (row ? _set(row) : null))(byId.get(id)),
    openOf: (agent: Agent) =>
      ((row) => (row ? _set(row) : null))(open.get(agent.userId, agent.group)),
    create: (agent, at) =>
      insert.get(
        agent.userId,
        agent.userName,
        agent.tokenId,
        agent.tokenName,
        agent.group,
        at
      )!.id,
    list: (isClosed, limit) =>
      (isClosed ? closed : pending).all(limit).map(_set),
    of: (userId, tokenId) => of.all(userId, tokenId).map(_set),
    save: (set) =>
      void update.run({
        $id: set.id,
        $title: set.title,
        $description: set.description,
        $status: set.status,
        $updated: set.updatedAt,
        $submitted: set.submittedAt,
        $closed: set.closedAt,
      }),
  };
};

type ProposalRow = {
  id: number;
  set_id: number;
  target: string;
  body: string;
  status: string;
  error: string;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
  decided_by: string;
};

const _proposal = (row: ProposalRow): Proposal => ({
  ...(JSON.parse(row.body) as ProposalBody),
  id: row.id,
  setId: row.set_id,
  status: row.status as ProposalStatus,
  error: row.error,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  decidedAt: row.decided_at,
  decidedBy: row.decided_by,
});

export var defineProposalRepository = (db: Database): ProposalRepository => {
  const byId = db.query<ProposalRow, [number]>(
    'SELECT * FROM review_proposals WHERE id = ?'
  );
  const of = db.query<ProposalRow, [number]>(
    'SELECT * FROM review_proposals WHERE set_id = ? ORDER BY id'
  );
  const pending = db.query<ProposalRow, [number, string]>(
    `SELECT * FROM review_proposals WHERE set_id = ? AND target = ? AND status = 'pending'`
  );
  const insert = db.query<{ id: number }, [number, string, string, string]>(
    `INSERT INTO review_proposals (set_id, target, body, status, created_at, updated_at)
     VALUES (?1, ?2, ?3, 'pending', ?4, ?4) RETURNING id`
  );
  const update = db.query(
    'UPDATE review_proposals SET body = ?, updated_at = ? WHERE id = ?'
  );
  const decide = db.query(
    `UPDATE review_proposals SET status = ?, decided_by = ?, decided_at = ?, error = '' WHERE id = ?`
  );
  const failed = db.query('UPDATE review_proposals SET error = ? WHERE id = ?');
  const count = db.query<{ n: number }, []>(
    `SELECT count(*) AS n FROM review_proposals WHERE status = 'pending'`
  );
  return {
    get: (id) => ((row) => (row ? _proposal(row) : null))(byId.get(id)),
    of: (setId) => of.all(setId).map(_proposal),
    pending: (setId, target) =>
      ((row) => (row ? _proposal(row) : null))(pending.get(setId, target)),
    add: (setId, body, at) =>
      insert.get(setId, targetOf(body), JSON.stringify(body), at)!.id,
    update: (id, body, at) => void update.run(JSON.stringify(body), at, id),
    decide: (id, status, by, at) => void decide.run(status, by, at, id),
    fail: (id, error) => void failed.run(error, id),
    pendingCount: () => count.get()?.n ?? 0,
  };
};

type LinkRow = {
  id: number;
  selector: string;
  verifier_hash: string;
  page_id: number;
  set_id: number | null;
  label: string;
  created_by: number | null;
  created_by_name: string;
  created_at: string;
  expires_at: string;
  last_used_at: string | null;
  uses: number;
};

const _link = (row: LinkRow): ShareLink => ({
  id: row.id,
  selector: row.selector,
  verifierHash: row.verifier_hash,
  target: { page: row.page_id, changeSet: row.set_id },
  label: row.label,
  createdBy:
    row.created_by === null
      ? null
      : { id: row.created_by, name: row.created_by_name },
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  lastUsedAt: row.last_used_at,
  uses: row.uses,
});

export var defineShareLinkRepository = (db: Database): ShareLinkRepository => {
  const bySelector = db.query<LinkRow, [string]>(
    'SELECT * FROM review_share_links WHERE selector = ?'
  );
  const byId = db.query<LinkRow, [number]>(
    'SELECT * FROM review_share_links WHERE id = ?'
  );
  // Цель — по тому, что задано: страница, набор или оба; ничего — все ссылки.
  const of = db.query<LinkRow, [number | null, number | null]>(
    `SELECT * FROM review_share_links
     WHERE (?1 IS NULL OR page_id = ?1) AND (?2 IS NULL OR set_id = ?2)
     ORDER BY id DESC LIMIT 200`
  );
  const ofPageOnly = db.query<LinkRow, [number]>(
    'SELECT * FROM review_share_links WHERE page_id = ? AND set_id IS NULL ORDER BY id DESC'
  );
  const insert = db.query<
    { id: number },
    Record<string, string | number | null>
  >(
    `INSERT INTO review_share_links
       (selector, verifier_hash, page_id, set_id, label, created_by, created_by_name, created_at, expires_at)
     VALUES ($selector, $hash, $page, $set, $label, $by, $name, $created, $expires) RETURNING id`
  );
  const touch = db.query(
    'UPDATE review_share_links SET last_used_at = ?, uses = uses + 1 WHERE id = ?'
  );
  const remove = db.query('DELETE FROM review_share_links WHERE id = ?');
  // Истёкшие держим ещё сутки: в менеджере видно, что ссылка кончилась, а не пропала.
  const expired = db.query(
    `DELETE FROM review_share_links WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ', ?, '-1 day')`
  );
  return {
    bySelector: (selector) =>
      ((row) => (row ? _link(row) : null))(bySelector.get(selector)),
    get: (id) => ((row) => (row ? _link(row) : null))(byId.get(id)),
    of: (target) =>
      (target.page !== undefined && target.changeSet === null
        ? ofPageOnly.all(target.page)
        : of.all(target.page ?? null, target.changeSet ?? null)
      ).map(_link),
    add: (link) =>
      insert.get({
        $selector: link.selector,
        $hash: link.verifierHash,
        $page: link.target.page,
        $set: link.target.changeSet,
        $label: link.label,
        $by: link.createdBy?.id ?? null,
        $name: link.createdBy?.name ?? '',
        $created: link.createdAt,
        $expires: link.expiresAt,
      })!.id,
    touch: (id, at) => void touch.run(at, id),
    remove: (id) => remove.run(id).changes > 0,
    removeExpired: (before) => void expired.run(before),
  };
};

type SettingsRow = { agents: number; link_days: number };

export var defineReviewSettingsRepository = (
  db: Database
): ReviewSettingsRepository => {
  const get = db.query<SettingsRow, []>(
    'SELECT agents, link_days FROM review_settings WHERE id = 1'
  );
  const save = db.query(
    `INSERT INTO review_settings (id, agents, link_days) VALUES (1, ?1, ?2)
     ON CONFLICT (id) DO UPDATE SET agents = ?1, link_days = ?2`
  );
  return {
    get: () =>
      ((row) =>
        row
          ? { agents: row.agents === 1, linkDays: row.link_days }
          : DEFAULT_REVIEW)(get.get()),
    save: (settings) =>
      void save.run(Number(settings.agents), settings.linkDays),
  };
};
