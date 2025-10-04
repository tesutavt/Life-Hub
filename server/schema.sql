PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  password TEXT,
  name TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  city TEXT,
  weather_api_key TEXT,
  google_refresh_token TEXT,
  tg_bot_token TEXT,
  tg_chat_id TEXT
);

CREATE TABLE IF NOT EXISTS fitness_daily(
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  steps INTEGER DEFAULT 0,
  hr_rest INTEGER,
  sleep_hours REAL,
  active_calories REAL,
  PRIMARY KEY(user_id, date),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fitness_activity(
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  steps INTEGER DEFAULT 0,
  calories REAL DEFAULT 0,
  distance REAL DEFAULT 0,
  move_minutes INTEGER DEFAULT 0,
  active_minutes INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, date),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fitness_heart_rate(
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  avg_bpm REAL,
  min_bpm REAL,
  max_bpm REAL,
  samples INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, date),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fitness_sleep(
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  duration_minutes REAL DEFAULT 0,
  deep_minutes REAL DEFAULT 0,
  light_minutes REAL DEFAULT 0,
  rem_minutes REAL DEFAULT 0,
  awake_minutes REAL DEFAULT 0,
  sessions INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, date),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS loans(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  bank TEXT,
  payment_monthly REAL,
  remaining REAL,
  due_day TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS accounts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  bank TEXT,
  number_mask TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  account_id INTEGER,
  ts INTEGER,
  amount REAL,
  description TEXT,
  mcc INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Gamification
CREATE TABLE IF NOT EXISTS user_xp(
  user_id INTEGER PRIMARY KEY,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS badges(
  id INTEGER PRIMARY KEY,
  name TEXT,
  description TEXT,
  icon TEXT
);
CREATE TABLE IF NOT EXISTS user_badges(
  user_id INTEGER,
  badge_id INTEGER,
  earned_at INTEGER,
  PRIMARY KEY(user_id, badge_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(badge_id) REFERENCES badges(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_missions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  points INTEGER DEFAULT 100,
  xp_reward INTEGER DEFAULT 50,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_mission_completions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  points_awarded INTEGER DEFAULT 0,
  xp_awarded INTEGER DEFAULT 0,
  completed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, mission_id, date),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES daily_missions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS weekly_mission_completions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  mission_key TEXT NOT NULL,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  progress_value INTEGER DEFAULT 0,
  reward_points INTEGER DEFAULT 0,
  reward_xp INTEGER DEFAULT 0,
  completed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, mission_key, week_start),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Calendar & life
CREATE TABLE IF NOT EXISTS calendar_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  date TEXT,
  title TEXT,
  type TEXT,
  mood INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS languages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  name TEXT,
  level TEXT,
  streak INTEGER DEFAULT 0,
  minutes_today INTEGER DEFAULT 0,
  image_url TEXT,
  banner_url TEXT,
  status TEXT DEFAULT 'active',
  archived_at TEXT
);


CREATE TABLE IF NOT EXISTS language_pages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  language_id INTEGER NOT NULL,
  page_id INTEGER NOT NULL,
  done INTEGER DEFAULT 0,
  done_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(language_id) REFERENCES languages(id) ON DELETE CASCADE,
  FOREIGN KEY(page_id) REFERENCES journal_pages(id) ON DELETE CASCADE,
  UNIQUE(user_id, language_id, page_id)
);

CREATE TABLE IF NOT EXISTS language_pdf_pages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  language_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  pdf_url TEXT NOT NULL,
  page_number INTEGER,
  done INTEGER DEFAULT 0,
  done_at TEXT,
  original_name TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(language_id) REFERENCES languages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS courses(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT,
  provider TEXT,
  course_type TEXT DEFAULT 'study',
  language_id INTEGER,
  progress INTEGER DEFAULT 0,
  status TEXT DEFAULT 'in-progress',
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS course_pages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  page_id INTEGER NOT NULL,
  done INTEGER DEFAULT 0,
  done_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(page_id) REFERENCES journal_pages(id) ON DELETE CASCADE,
  UNIQUE(user_id, course_id, page_id)
);

CREATE TABLE IF NOT EXISTS course_pdf_pages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  pdf_url TEXT NOT NULL,
  page_number INTEGER,
  done INTEGER DEFAULT 0,
  done_at TEXT,
  original_name TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS yearly_goals(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT,
  target INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  streak_current INTEGER DEFAULT 0,
  streak_best INTEGER DEFAULT 0,
  archived_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS yearly_goal_logs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  goal_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, goal_id, date),
  FOREIGN KEY(goal_id) REFERENCES yearly_goals(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS socials(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  platform TEXT,
  url TEXT
);

CREATE TABLE IF NOT EXISTS social_settings(
  user_id INTEGER PRIMARY KEY,
  tg_bot_token TEXT,
  tg_chat_id TEXT,
  twitch_channel TEXT,
  youtube_channel_id TEXT,
  tg_stream_template TEXT,
  tg_video_template TEXT,
  last_video_id TEXT,
  last_stream_live INTEGER DEFAULT 0,
  updated_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ui_settings(
  user_id INTEGER PRIMARY KEY,
  show_menu_counters INTEGER DEFAULT 1,
  hidden_menu_items TEXT,
  notification_preferences TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS journal(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  date TEXT,
  text TEXT
);

CREATE TABLE IF NOT EXISTS habits(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT,
  target_per_week INTEGER,
  done_this_week INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS habit_checks(
  user_id INTEGER NOT NULL,
  habit_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  PRIMARY KEY(user_id, habit_id, date),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS travel_plans(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT,
  location TEXT,
  date_from TEXT,
  date_to TEXT,
  status TEXT DEFAULT 'planned',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS tags(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  color TEXT DEFAULT '#6366F1',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS page_tags(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  page_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, page_id, tag_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(page_id) REFERENCES journal_pages(id) ON DELETE CASCADE,
  FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tag_links(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, tag_id, entity_type, entity_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tag_links_user_type ON tag_links(user_id, entity_type, entity_id);

CREATE TABLE IF NOT EXISTS journal_pages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT,
  blocks_json TEXT,
  page_date TEXT,
  banner_url TEXT,
  banner_gradient TEXT,
  pinned INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS life_feed(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT,
  title TEXT,
  text TEXT,
  meta TEXT,
  ts TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS social_logs(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  type TEXT,
  title TEXT,
  url TEXT,
  event_date TEXT,
  created_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

