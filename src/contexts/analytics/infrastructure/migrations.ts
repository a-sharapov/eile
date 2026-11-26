import type { Database, Migration } from '../../../platform/database.ts';

// «Курс есть», выписки и экран курсов читают деньги только людей с суммами: на 33 000 людей — 6 мс вместо 33 по всей
// таблице (замер ADR). Запрос пишет то же условие, а test — через +test, иначе планировщик идёт индексом списка.
// Люди — производные: у таблицы старого вида (JSON-копия без миграций людей) индекса нет, чтение верно и без него.
const _peopleMoney = (db: Database): void =>
  void (
    db
      .query<{ name: string }, []>(
        "SELECT name FROM pragma_table_info('analytics_people')"
      )
      .all()
      .some((_) => _.name === 'fee_money') &&
    db.run(`
      CREATE INDEX analytics_people_money ON analytics_people (subject)
        WHERE money <> '[]' OR fee_money <> '[]'`)
  );

export var analyticsMigrations: readonly Migration[] = [
  {
    // Настройка и события — данные сайта, в копии вместе с ним. Ключи отправителей — сервера. Люди —
    // производные: строятся из событий. Связи — кодами, без внешних ключей: ссылки проверяет домен, а
    // архив вместо удаления оставляет прошлые события читаемыми.
    id: 'analytics/001_analytics',
    sql: `
      CREATE TABLE analytics_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        value TEXT NOT NULL,                       -- JSON AnalyticsSettings: enabled, retentionMonths
        revision INTEGER NOT NULL DEFAULT 0,       -- ревизия справочников
        updated_at TEXT NOT NULL
      );
      CREATE TABLE analytics_senders (
        code TEXT PRIMARY KEY, name TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1, archived_at TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE analytics_types (
        sender TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL, properties TEXT NOT NULL DEFAULT '[]', -- [{ code, required }]
        archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY (sender, code)
      ) WITHOUT ROWID;
      CREATE TABLE analytics_properties (
        scope TEXT NOT NULL CHECK (scope IN ('event', 'person')), code TEXT NOT NULL,
        name TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, dictionary TEXT,
        dimension INTEGER NOT NULL DEFAULT 0, untrusted INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY (scope, code)
      ) WITHOUT ROWID;
      CREATE TABLE analytics_dictionaries (
        code TEXT PRIMARY KEY, name TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', purpose TEXT NOT NULL,
        archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE analytics_values (
        dictionary TEXT NOT NULL, code TEXT NOT NULL, name TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0, archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY (dictionary, code)
      ) WITHOUT ROWID;
      CREATE TABLE analytics_setup_log (
        id INTEGER PRIMARY KEY, at TEXT NOT NULL, user_id INTEGER, user_name TEXT NOT NULL,
        agent INTEGER NOT NULL DEFAULT 0, item TEXT NOT NULL, key TEXT NOT NULL, action TEXT NOT NULL,
        before TEXT, after TEXT
      );
      CREATE INDEX analytics_setup_log_at ON analytics_setup_log (at);

      CREATE TABLE analytics_sender_keys (
        id INTEGER PRIMARY KEY, sender TEXT NOT NULL, label TEXT NOT NULL, hash TEXT NOT NULL UNIQUE,
        hint TEXT NOT NULL, created_at TEXT NOT NULL, used_at TEXT
      );

      CREATE TABLE analytics_events (
        seq INTEGER PRIMARY KEY,                   -- порядок приёма
        sender TEXT NOT NULL, id TEXT NOT NULL, type TEXT NOT NULL,
        at TEXT NOT NULL,                          -- UTC, ISO 8601 с миллисекундами
        subject TEXT, test INTEGER NOT NULL DEFAULT 0,
        received_at TEXT NOT NULL, origin TEXT NOT NULL, -- 'http' | 'file'
        body TEXT NOT NULL,                        -- тело как пришло
        hash TEXT NOT NULL,                        -- SHA-256 канонического JSON, base64url
        UNIQUE (sender, id)
      );
      CREATE INDEX analytics_events_subject ON analytics_events (subject, at) WHERE subject IS NOT NULL;
      CREATE INDEX analytics_events_type ON analytics_events (sender, type, at);
      CREATE INDEX analytics_events_at ON analytics_events (at);
      CREATE TABLE analytics_conflicts (
        sender TEXT NOT NULL, id TEXT NOT NULL, subject TEXT, count INTEGER NOT NULL,
        first_at TEXT NOT NULL, last_at TEXT NOT NULL, body TEXT NOT NULL, hash TEXT NOT NULL,
        PRIMARY KEY (sender, id)
      ) WITHOUT ROWID;
      CREATE TABLE analytics_erasures (
        id INTEGER PRIMARY KEY, at TEXT NOT NULL, before TEXT NOT NULL, origin TEXT NOT NULL,
        sender TEXT, user_name TEXT, events INTEGER NOT NULL, people INTEGER NOT NULL,
        subject_hash TEXT                          -- SHA-256 псевдонима; у срока хранения — NULL
      );
      CREATE INDEX analytics_erasures_subject ON analytics_erasures (subject_hash) WHERE subject_hash IS NOT NULL;

      CREATE TABLE analytics_people (
        subject TEXT PRIMARY KEY, test INTEGER NOT NULL, senders TEXT NOT NULL,
        first_at TEXT NOT NULL, last_at TEXT NOT NULL, events INTEGER NOT NULL, invalid INTEGER NOT NULL,
        first_touch_label TEXT, first_touch_at TEXT, first_touch_conflict INTEGER NOT NULL,
        last_touch_label TEXT, last_touch_at TEXT, answers TEXT NOT NULL,
        trial_at TEXT, trial_ends_at TEXT,
        payments INTEGER NOT NULL, first_paid_at TEXT, last_paid_at TEXT, paid_until TEXT,
        lapsed_at TEXT, returned_at TEXT, revenue TEXT NOT NULL, fees TEXT NOT NULL,
        traits TEXT NOT NULL, revision INTEGER NOT NULL
      ) WITHOUT ROWID;
      CREATE INDEX analytics_people_last ON analytics_people (last_at);
      CREATE INDEX analytics_people_first ON analytics_people (first_at);
      CREATE TABLE analytics_people_build (
        id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL, cursor TEXT
      );
    `,
  },
  {
    // Части метки (справочники с назначением parts), схемы меток, соответствия рефереров, переходы, вехи и
    // воронки — настройка, данные сайта. Ссылки — кодами, как у справочников.
    id: 'analytics/002_setup_stage2',
    sql: `
      ALTER TABLE analytics_dictionaries ADD COLUMN utm TEXT;        -- часть метки: utm_source … utm_term
      ALTER TABLE analytics_dictionaries ADD COLUMN length INTEGER;  -- часть метки: предел длины значения
      CREATE TABLE analytics_schemas (
        sender TEXT PRIMARY KEY, name TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
        separator TEXT NOT NULL, length INTEGER NOT NULL,
        parts TEXT NOT NULL,                       -- [код части, …]: по порядку в метке
        archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE analytics_referrers (
        code TEXT PRIMARY KEY, name TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL CHECK (kind IN ('host', 'any', 'none')), host TEXT,
        parts TEXT NOT NULL DEFAULT '{}',          -- { часть: значение | "{host}" }
        archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE analytics_links (
        code TEXT PRIMARY KEY, name TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
        sender TEXT NOT NULL, target TEXT NOT NULL, -- https://…{label}…
        parts TEXT NOT NULL DEFAULT '{}',          -- заданные заранее: { часть: значение }
        archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE analytics_milestones (
        code TEXT PRIMARY KEY, name TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
        sender TEXT NOT NULL, type TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 1,
        condition TEXT,                            -- { property, gte } | { property, eq } | NULL
        days INTEGER,                              -- окно; NULL — без срока
        anchor TEXT,                               -- код типа; NULL — от прихода
        shown INTEGER NOT NULL DEFAULT 1,          -- column: столбцом в «Источниках»
        position INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE analytics_funnels (
        code TEXT PRIMARY KEY, name TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
        strict INTEGER NOT NULL DEFAULT 0, main INTEGER NOT NULL DEFAULT 0,
        steps TEXT NOT NULL,                       -- [{ kind, … }], 2–8
        position INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ) WITHOUT ROWID;
    `,
  },
  {
    // Люди — производные: таблица нового вида строится заново, строки сборки нет — проход начнётся сначала.
    // С rowid, а не WITHOUT ROWID: строка с JSON около килобайта ушла бы из дерева ключа в переполнение.
    id: 'analytics/003_people_stage2',
    sql: `
      DROP TABLE analytics_people;
      DELETE FROM analytics_people_build;
      CREATE TABLE analytics_people (
        subject TEXT NOT NULL UNIQUE, test INTEGER NOT NULL, senders TEXT NOT NULL,
        first_at TEXT NOT NULL, last_at TEXT NOT NULL, events INTEGER NOT NULL, invalid INTEGER NOT NULL,
        arrived_at TEXT NOT NULL,                  -- приход: первое касание, без касаний — первое событие
        first_touch_label TEXT, first_touch_at TEXT, first_touch_sender TEXT, first_touch_conflict INTEGER NOT NULL,
        first_parts TEXT NOT NULL,                 -- { часть: значение } первого касания
        last_touch_label TEXT, last_touch_at TEXT, last_touch_sender TEXT,
        last_parts TEXT NOT NULL,                  -- { часть: значение } последнего касания
        returns TEXT NOT NULL,                     -- [[момент оплаты, метка, момент касания, отправитель, { части }]]
        answers TEXT NOT NULL, trial_at TEXT, trial_ends_at TEXT,
        payments INTEGER NOT NULL, first_paid_at TEXT, last_paid_at TEXT, paid_until TEXT,
        first_term_end TEXT,                       -- paid_until первой оплаты или «конец доступа» после неё
        lapsed_at TEXT, returned_at TEXT, revenue TEXT NOT NULL, fees TEXT NOT NULL,
        money TEXT NOT NULL,                       -- [[момент, валюта, сумма]]: оплаты > 0, возвраты < 0
        milestones TEXT NOT NULL,                  -- { веха: [достиг, конец окна, начало окна] }
        firsts TEXT NOT NULL,                      -- { "отправитель/тип": момент первого события }
        dims TEXT NOT NULL,                        -- { свойство-разрез: значение самого раннего события }
        traits TEXT NOT NULL, revision INTEGER NOT NULL
      );
      -- Список — по last_at, затем по псевдониму: в таблице с rowid псевдоним в индекс сам не входит, а без него
      -- порядок досортировывается во временном дереве (страница со смещением 4 000 — втрое дольше, замер ADR).
      CREATE INDEX analytics_people_last ON analytics_people (last_at, subject);
      -- Подсчёт под фильтрами списка и отставших по ревизии — по узкому индексу, а не по строкам вдвое шире,
      -- чем на этапе 1: 0,3 мс вместо 1,6 на 10 000 человек (замер ADR).
      CREATE INDEX analytics_people_list ON analytics_people
        (test, payments, trial_at, lapsed_at, paid_until, returned_at, senders, subject, revision);
      CREATE INDEX analytics_people_first ON analytics_people (first_at);
      CREATE INDEX analytics_people_arrived ON analytics_people (arrived_at);
    `,
  },
  {
    // Реестр меток — данные сайта, но не настройка: людей не меняет, ревизии не повышает, в набор не идёт.
    id: 'analytics/004_labels',
    sql: `
      CREATE TABLE analytics_labels (
        sender TEXT NOT NULL, label TEXT NOT NULL, name TEXT NOT NULL,
        parts TEXT NOT NULL,                       -- { часть: значение }, из которых собрана
        link TEXT,                                 -- переход, чьи заданные заранее части в ней
        user_name TEXT, agent INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
        PRIMARY KEY (sender, label)
      ) WITHOUT ROWID;
    `,
  },
  {
    // Курсы и расходы — данные сайта, но не настройка: людей не меняют, ревизии не повышают, в набор не идут.
    // «Ждёт расхода» — настройка: отметка значения части.
    id: 'analytics/005_money',
    sql: `
      ALTER TABLE analytics_values ADD COLUMN awaits_spend INTEGER; -- значение части: 0 или 1; у других — NULL
      UPDATE analytics_values SET awaits_spend = 0
        WHERE dictionary IN (SELECT code FROM analytics_dictionaries WHERE purpose = 'parts');
      CREATE TABLE analytics_rates (
        base TEXT NOT NULL, currency TEXT NOT NULL,
        day TEXT NOT NULL,                         -- с этого дня пояса отчётов до следующей записи
        rate TEXT NOT NULL,                        -- цена единицы currency в base, десятичной строкой
        user_name TEXT, agent INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
        PRIMARY KEY (base, currency, day)
      ) WITHOUT ROWID;
      CREATE TABLE analytics_spend (
        id INTEGER PRIMARY KEY,
        month TEXT NOT NULL,                       -- ГГГГ-ММ пояса отчётов
        parts TEXT NOT NULL,                       -- { часть: значение }, ключи по алфавиту; {} — общий расход
        currency TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK (amount >= 0), -- минимальные единицы
        note TEXT NOT NULL DEFAULT '',
        user_name TEXT, agent INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE (month, parts, currency)
      );
    `,
  },
  {
    // Люди — производные: свёртка этапа 3 (курс возврата, комиссии по времени, отрезки доступа) — таблица нового
    // вида строится заново, как миграцией 003.
    id: 'analytics/006_people_stage3',
    sql: `
      DROP TABLE analytics_people;
      DELETE FROM analytics_people_build;
      CREATE TABLE analytics_people (
        subject TEXT NOT NULL UNIQUE, test INTEGER NOT NULL, senders TEXT NOT NULL,
        first_at TEXT NOT NULL, last_at TEXT NOT NULL, events INTEGER NOT NULL, invalid INTEGER NOT NULL,
        arrived_at TEXT NOT NULL,
        first_touch_label TEXT, first_touch_at TEXT, first_touch_sender TEXT, first_touch_conflict INTEGER NOT NULL,
        first_parts TEXT NOT NULL,
        last_touch_label TEXT, last_touch_at TEXT, last_touch_sender TEXT,
        last_parts TEXT NOT NULL,
        returns TEXT NOT NULL,
        answers TEXT NOT NULL, trial_at TEXT, trial_ends_at TEXT,
        payments INTEGER NOT NULL, first_paid_at TEXT, last_paid_at TEXT, paid_until TEXT,
        first_term_end TEXT,
        lapsed_at TEXT, returned_at TEXT, revenue TEXT NOT NULL, fees TEXT NOT NULL,
        money TEXT NOT NULL,                       -- [[момент, валюта, сумма, момент курса?]]: оплаты > 0, возвраты < 0
        fee_money TEXT NOT NULL,                   -- [[момент оплаты, валюта, комиссия]]
        access TEXT NOT NULL,                      -- [[начало, конец | null]]: отрезки доступа
        milestones TEXT NOT NULL, firsts TEXT NOT NULL, dims TEXT NOT NULL,
        traits TEXT NOT NULL, revision INTEGER NOT NULL
      );
      CREATE INDEX analytics_people_last ON analytics_people (last_at, subject);
      CREATE INDEX analytics_people_list ON analytics_people
        (test, payments, trial_at, lapsed_at, paid_until, returned_at, senders, subject, revision);
      CREATE INDEX analytics_people_first ON analytics_people (first_at);
      CREATE INDEX analytics_people_arrived ON analytics_people (arrived_at);
      -- Только клиенты: когорты и «Обзор» читают их, не трогая остальных; запись человека без оплат индекса не
      -- касается.
      CREATE INDEX analytics_people_paid ON analytics_people (first_paid_at)
        WHERE first_paid_at IS NOT NULL;
    `,
  },
  {
    // Счёт приёма и стёртого — данные сайта: в копии вместе с событиями. Час сводки — настройка; у отправителей
    // до обновления — 06:00, порог ТЗ.
    id: 'analytics/007_intake',
    sql: `
      ALTER TABLE analytics_senders ADD COLUMN summary_at TEXT DEFAULT '06:00'; -- ЧЧ:ММ UTC; NULL — сводок не ждать
      CREATE TABLE analytics_intake_daily (
        day TEXT NOT NULL,                         -- сутки UTC приёма
        sender TEXT NOT NULL,                      -- '' — ключ не узнан или не проверялся
        origin TEXT NOT NULL CHECK (origin IN ('http', 'file')),
        outcome TEXT NOT NULL,                     -- accepted, duplicate, conflict, erased, erasure, invalid, unauthorized,
                                                   -- throttled, disabled; future и late — отметки среди принятых
        count INTEGER NOT NULL,
        PRIMARY KEY (day, sender, origin, outcome)
      ) WITHOUT ROWID;
      CREATE TABLE analytics_erased_daily (
        day TEXT NOT NULL,                         -- сутки UTC момента события
        sender TEXT NOT NULL, type TEXT NOT NULL, test INTEGER NOT NULL,
        events INTEGER NOT NULL,                   -- стёрты после приёма, приняты ответом «стёрто», события удаления
        PRIMARY KEY (day, sender, type, test)
      ) WITHOUT ROWID;
      -- «Нет дублей оплат»: номер оплаты по индексу, а не разбором всех оплат отправителя. Запрос пишет то же
      -- выражение, иначе SQLite индекс не возьмёт.
      CREATE INDEX analytics_events_payment ON analytics_events (sender, json_extract(body, '$.data.payment_id'))
        WHERE json_extract(body, '$.data.payment_id') IS NOT NULL;
    `,
  },
  {
    // Проверки — настройка; результаты по дням и отпечатки стёртых событий — данные сайта; курсор такта —
    // производный: после восстановления копии его нет, и такт перепроверяет 30 суток.
    id: 'analytics/008_quality',
    sql: `
      CREATE TABLE analytics_checks (
        code TEXT PRIMARY KEY,                     -- встроенная — код ядра, своя — код владельца
        name TEXT NOT NULL DEFAULT '',             -- у встроенной пусто: название — ядра
        note TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        notify TEXT NOT NULL DEFAULT 'failure' CHECK (notify IN ('failure', 'any', 'off')),
        params TEXT NOT NULL DEFAULT '{}',         -- пороги встроенной или правило своей (JSON)
        archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      ) WITHOUT ROWID;
      CREATE TABLE analytics_check_days (
        check_code TEXT NOT NULL,
        scope TEXT NOT NULL,                       -- отправитель; '' — сайт
        test INTEGER NOT NULL DEFAULT 0,           -- тестовая сводка против тестовых событий
        day TEXT NOT NULL,                         -- ГГГГ-ММ-ДД: сутки проверки; у месячной — первый день месяца
        state TEXT NOT NULL CHECK (state IN ('ok', 'warning', 'failure', 'no_data')),
        reason TEXT,                               -- missing, late, extra, erased, intake_off, no_summary, low_volume, …
        value REAL,                                -- главное число строки
        detail TEXT NOT NULL DEFAULT '{}',         -- JSON без псевдонимов, меток и тел
        version TEXT,                              -- версия сводки дня
        evaluated_at TEXT NOT NULL,
        resolved_at TEXT, resolved_by TEXT, resolved_agent INTEGER NOT NULL DEFAULT 0, resolution TEXT,
        notified_at TEXT,                          -- с этой строкой ушло уведомление или напоминание
        episode TEXT,                              -- первый день эпизода — у строки с уведомлением
        recovered_at TEXT,                         -- ушло «снова в порядке»
        PRIMARY KEY (check_code, scope, test, day)
      ) WITHOUT ROWID;
      CREATE INDEX analytics_check_days_day ON analytics_check_days (day);
      CREATE TABLE analytics_quality_cursor (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        seq INTEGER NOT NULL,                      -- последнее событие, которое такт видел
        revision INTEGER NOT NULL,                 -- ревизия настройки прошлого такта
        marks TEXT NOT NULL DEFAULT '{}'           -- последние строки журнала настройки и журнала удалений
      );
      -- Отпечаток тела стёртого события (тот же SHA-256 канонического JSON, что был у события): повтор отправки
      -- стёртого и повтор удаления не прибавляют его в счёт стёртого второй раз. Псевдонима и тела нет; 40 суток.
      CREATE TABLE analytics_erased_events (
        sender TEXT NOT NULL,
        hash TEXT NOT NULL,
        day TEXT NOT NULL,                         -- сутки UTC момента события: по ним срок хранения
        PRIMARY KEY (sender, hash)
      ) WITHOUT ROWID;
      CREATE INDEX analytics_erased_events_day ON analytics_erased_events (day);
    `,
  },
  {
    // Выписки — данные сайта, как курсы: ревизии не повышают и в набор не идут. Отметка сверки свойства —
    // настройка. Деньги людей — частичным индексом (`_peopleMoney`).
    id: 'analytics/009_statements',
    run: (db) => (
      db.run(`
        CREATE TABLE analytics_statements (
          month TEXT NOT NULL,                     -- ГГГГ-ММ пояса отчётов
          currency TEXT NOT NULL,
          amount INTEGER NOT NULL,                 -- минимальные единицы, со знаком
          fees TEXT NOT NULL DEFAULT 'gross' CHECK (fees IN ('gross', 'net')),
          note TEXT NOT NULL DEFAULT '',
          user_name TEXT, agent INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
          PRIMARY KEY (month, currency)
        ) WITHOUT ROWID;
        ALTER TABLE analytics_properties ADD COLUMN reconcile TEXT; -- payment_number, customer_since, after_trial, returning
      `),
      _peopleMoney(db)
    ),
  },
];

/** Ключи отправителей — этого сервера: в копию сайта не попадают, восстановление их не меняет. */
export var ANALYTICS_SERVER_TABLES: readonly string[] = [
  'analytics_sender_keys',
];

/**
 * Люди выводятся из событий, курсор такта проверок — из событий и настройки: в JSON-копию не идут,
 * восстановление их не трогает, а после восстановления они очищаются и строятся заново. В копию .db попадают
 * как есть.
 */
export var ANALYTICS_DERIVED_TABLES: readonly string[] = [
  'analytics_people',
  'analytics_people_build',
  'analytics_quality_cursor',
];
