CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slot TEXT NOT NULL,
  weekdays TEXT NOT NULL,
  time TEXT NOT NULL,
  series_id INTEGER NOT NULL,
  pdf_urls TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE lessons (
  course_id TEXT NOT NULL,
  number INTEGER NOT NULL,
  hijri_date TEXT NOT NULL,
  start_point TEXT NOT NULL,
  pdf_index INTEGER,
  start_page INTEGER,
  end_point TEXT,
  end_page INTEGER,
  recording_url TEXT,
  detail_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (course_id, number)
);

CREATE TABLE exceptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id TEXT,
  kind TEXT NOT NULL,
  date_from TEXT NOT NULL,
  date_to TEXT,
  time TEXT,
  note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE live_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  is_live INTEGER NOT NULL DEFAULT 0,
  broadcast_uid TEXT,
  stream_url TEXT,
  course_id TEXT,
  started_at TEXT
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE sent_notifications (
  key TEXT PRIMARY KEY,
  sent_at TEXT NOT NULL
);
