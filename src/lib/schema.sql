PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_organizer INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  sport TEXT NOT NULL DEFAULT 'running',
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  start_date TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TTD',
  status TEXT NOT NULL DEFAULT 'draft',            -- draft | published | closed
  waiver_text TEXT NOT NULL DEFAULT '',
  refund_policy TEXT NOT NULL DEFAULT '',
  payment_methods TEXT NOT NULL DEFAULT '["manual"]', -- JSON array of provider ids
  manual_payment_instructions TEXT NOT NULL DEFAULT '',
  fee_absorbed INTEGER NOT NULL DEFAULT 0,         -- 1 = organizer pays platform fee
  fundraising_enabled INTEGER NOT NULL DEFAULT 0,
  fundraising_cause TEXT NOT NULL DEFAULT '',
  fundraising_goal_cents INTEGER NOT NULL DEFAULT 0,
  retention_days INTEGER NOT NULL DEFAULT 365,     -- anonymize participant data this long after the event
  next_bib INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_staff (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                              -- owner | manager | checkin | viewer
  PRIMARY KEY (event_id, user_id)
);

CREATE TABLE IF NOT EXISTS races (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  distance TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'individual',         -- individual | team | relay
  capacity INTEGER NOT NULL DEFAULT 0,             -- 0 = unlimited
  min_age INTEGER NOT NULL DEFAULT 0,
  team_min INTEGER NOT NULL DEFAULT 2,
  team_max INTEGER NOT NULL DEFAULT 4,
  relay_legs TEXT NOT NULL DEFAULT '[]',           -- JSON array of leg names, e.g. ["Swim","Bike","Run"]
  start_time TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS price_tiers (
  id TEXT PRIMARY KEY,
  race_id TEXT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  starts_at TEXT,                                  -- null = open
  ends_at TEXT
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text',               -- text | select | checkbox
  options TEXT NOT NULL DEFAULT '[]',
  required INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS discount_codes (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'percent',            -- percent | fixed
  amount INTEGER NOT NULL,                         -- percent (0-100) or cents
  max_uses INTEGER NOT NULL DEFAULT 0,             -- 0 = unlimited
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  UNIQUE (event_id, code)
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  race_id TEXT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  captain_user_id TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  user_id TEXT REFERENCES users(id),
  buyer_email TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  donation_cents INTEGER NOT NULL DEFAULT 0,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',          -- pending | paid | refunded | cancelled
  payment_method TEXT,
  provider_ref TEXT,
  discount_code_id TEXT REFERENCES discount_codes(id),
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  event_id TEXT NOT NULL REFERENCES events(id),
  race_id TEXT NOT NULL REFERENCES races(id),
  user_id TEXT REFERENCES users(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT '',
  birth_year INTEGER,                              -- kept in clear for age stats; full DOB is encrypted
  dob_enc TEXT,
  phone_enc TEXT,
  emergency_enc TEXT,                              -- encrypted JSON {name, phone}
  medical_enc TEXT,                                -- encrypted free text
  country TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  club TEXT NOT NULL DEFAULT '',
  tshirt TEXT NOT NULL DEFAULT '',
  answers TEXT NOT NULL DEFAULT '{}',
  team_id TEXT REFERENCES teams(id),
  relay_leg TEXT NOT NULL DEFAULT '',
  bib INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',          -- pending | confirmed | cancelled
  checked_in_at TEXT,
  waiver_name TEXT,
  waiver_at TEXT,
  guardian_name TEXT,
  consent_privacy_at TEXT NOT NULL,
  consent_marketing INTEGER NOT NULL DEFAULT 0,
  fundraising_goal_cents INTEGER NOT NULL DEFAULT 0,
  anonymized_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reg_event ON registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_reg_email ON registrations(email);

CREATE TABLE IF NOT EXISTS donations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  registration_id TEXT REFERENCES registrations(id),
  order_id TEXT REFERENCES orders(id),
  donor_name TEXT NOT NULL DEFAULT 'Anonymous',
  message TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS results (
  id TEXT PRIMARY KEY,
  race_id TEXT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  bib INTEGER,
  name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  chip_time TEXT NOT NULL DEFAULT '',
  gun_time TEXT NOT NULL DEFAULT '',
  place INTEGER
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id TEXT PRIMARY KEY,
  event_id TEXT REFERENCES events(id),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',           -- queued | sent | failed | logged
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  event_id TEXT,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS data_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  email TEXT NOT NULL,
  kind TEXT NOT NULL,                              -- export | delete
  status TEXT NOT NULL DEFAULT 'open',             -- open | done
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
