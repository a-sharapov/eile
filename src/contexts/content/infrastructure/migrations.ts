import type { Migration } from '../../../platform/database.ts';

export var contentMigrations: readonly Migration[] = [
  {
    id: 'content/001_pages',
    sql: `
      CREATE TABLE content_pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER REFERENCES content_pages (id),
        title TEXT NOT NULL,
        alias TEXT NOT NULL,
        template TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        published INTEGER NOT NULL DEFAULT 0,
        menu_index INTEGER NOT NULL DEFAULT 0,
        hidden_from_menu INTEGER NOT NULL DEFAULT 0,
        cacheable INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX content_pages_sibling_alias
        ON content_pages (coalesce(parent_id, 0), alias);
      CREATE INDEX content_pages_children ON content_pages (parent_id, menu_index);
    `,
  },
  {
    id: 'content/002_fields',
    sql: `
      CREATE TABLE content_fields (
        name TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        type TEXT NOT NULL,
        options TEXT NOT NULL DEFAULT '[]',
        default_value TEXT,
        inherit INTEGER NOT NULL DEFAULT 0,
        templates TEXT NOT NULL DEFAULT '[]'
      ) WITHOUT ROWID;
      CREATE TABLE content_field_values (
        page_id INTEGER NOT NULL REFERENCES content_pages (id),
        field TEXT NOT NULL REFERENCES content_fields (name),
        value TEXT NOT NULL,
        PRIMARY KEY (page_id, field)
      ) WITHOUT ROWID;
    `,
  },
  {
    id: 'content/003_document_fields',
    sql: `
      ALTER TABLE content_pages ADD COLUMN kind TEXT NOT NULL DEFAULT 'page';
      ALTER TABLE content_pages ADD COLUMN long_title TEXT NOT NULL DEFAULT '';
      ALTER TABLE content_pages ADD COLUMN menu_title TEXT NOT NULL DEFAULT '';
      ALTER TABLE content_pages ADD COLUMN description TEXT NOT NULL DEFAULT '';
      ALTER TABLE content_pages ADD COLUMN intro_text TEXT NOT NULL DEFAULT '';
      ALTER TABLE content_pages ADD COLUMN link_to TEXT NOT NULL DEFAULT '';
      ALTER TABLE content_pages ADD COLUMN publish_at TEXT;
      ALTER TABLE content_pages ADD COLUMN unpublish_at TEXT;
      ALTER TABLE content_pages ADD COLUMN published_at TEXT;
      ALTER TABLE content_pages ADD COLUMN trashed_at TEXT;
      UPDATE content_pages SET published_at = updated_at WHERE published = 1;
      DROP INDEX content_pages_sibling_alias;
      CREATE UNIQUE INDEX content_pages_sibling_alias
        ON content_pages (coalesce(parent_id, 0), alias) WHERE trashed_at IS NULL;
      CREATE INDEX content_pages_publish_at ON content_pages (publish_at)
        WHERE publish_at IS NOT NULL;
      CREATE INDEX content_pages_unpublish_at ON content_pages (unpublish_at)
        WHERE unpublish_at IS NOT NULL;
    `,
  },
  {
    id: 'content/004_search',
    sql: `
      ALTER TABLE content_pages ADD COLUMN searchable INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE content_pages ADD COLUMN social_image TEXT NOT NULL DEFAULT '';
      CREATE TABLE content_old_paths (
        path TEXT PRIMARY KEY,
        page_id INTEGER NOT NULL,
        moved_at TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE INDEX content_old_paths_page ON content_old_paths (page_id);
    `,
  },
  {
    id: 'content/005_language',
    sql: `
      ALTER TABLE content_pages ADD COLUMN language TEXT NOT NULL DEFAULT '';
    `,
  },
  {
    id: 'content/006_content_type',
    sql: `
      ALTER TABLE content_pages ADD COLUMN content_type TEXT NOT NULL DEFAULT 'text/html';
    `,
  },
  {
    // Лента по покрывающему индексу: отбор и сортировка без чтения текстов страниц (они идут раньше
    // этих колонок, и SQLite пришлось бы проходить их страницы переполнения).
    id: 'content/007_listing_index',
    sql: `
      CREATE INDEX content_pages_listing ON content_pages (
        parent_id, published, content_type, hidden_from_menu, trashed_at,
        published_at, created_at, menu_index, title
      );
    `,
  },
];
