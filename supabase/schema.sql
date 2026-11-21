-- MARKET MAYHEM online: run this once in Supabase (SQL Editor > New query > Run).
-- Row Level Security is ON with no policies, so the public "anon" key can read nothing.
-- Only the server (service-role key, kept in Vercel env vars) can touch these tables.

create extension if not exists citext;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  nickname citext unique not null check (char_length(nickname) between 3 and 16),
  pin_hash text not null,
  created_at timestamptz not null default now(),
  last_seen timestamptz,
  banned boolean not null default false,
  ban_reason text,
  vol_mult real not null default 1 check (vol_mult between 0.25 and 4),
  luck real not null default 0 check (luck between -1 and 1),
  mods_ver integer not null default 1,
  failed_logins integer not null default 0,
  locked_until timestamptz,
  avatar jsonb not null default '{}'::jsonb,        -- look: skin, hair, shirt colour, eyewear
  profile jsonb not null default '{}'::jsonb,       -- career snapshot (net worth, level, toys) and recent trades
  profile_at timestamptz
);

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  week text not null,
  status text not null default 'active' check (status in ('active','submitted','rejected','removed')),
  start_payload jsonb not null,
  issued jsonb not null default '[]'::jsonb,      -- every god payload sent to the client
  final_nw bigint,                                 -- cents, verified by replay
  ret real,
  rigged boolean not null default false,           -- admin-only: god mode touched this run
  reject_reason text,
  max_tick integer not null default 0,
  suspect boolean not null default false,          -- admin-only: client went back in time (save reload)
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  actions jsonb
);
create unique index if not exists runs_one_per_week on runs(player_id, week) where status <> 'removed';
create index if not exists runs_board on runs(week, status, ret desc);

create table if not exists cash_adjustments (
  id bigint generated always as identity primary key,
  player_id uuid not null references players(id) on delete cascade,
  amount_cents bigint not null,
  note text,
  created_at timestamptz not null default now(),
  run_id uuid references runs(id) on delete set null,  -- set once delivered to a ranked run
  claimed boolean not null default false               -- set once delivered to a career game
);

-- crashes, booms and Market God announcements. player_id null = everyone; game_day null = as soon as possible
create table if not exists global_events (
  id bigint generated always as identity primary key,
  week text not null,
  kind text not null check (kind in ('crash','boom','announce')),
  magnitude double precision not null check (magnitude between -0.4000001 and 0.4000001 and abs(magnitude) >= 0.0099999),
  game_day integer check (game_day between 0 and 24),
  player_id uuid references players(id) on delete cascade,
  ticker text,
  speaker text check (char_length(speaker) <= 40),
  headline text check (char_length(headline) <= 160),
  unit text check (unit in ('pct','usd')),          -- stock pumps: amount in percent or dollars per share...
  amount double precision,
  duration_days integer check (duration_days between 0 and 24),  -- ...spread over this many game days
  created_at timestamptz not null default now()
);

create table if not exists follows (
  follower uuid not null references players(id) on delete cascade,
  followee uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);

create table if not exists duels (
  id uuid primary key default gen_random_uuid(),
  challenger uuid not null references players(id) on delete cascade,
  opponent uuid not null references players(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','active','declined','cancelled')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (challenger <> opponent)
);
create index if not exists duels_challenger on duels(challenger);
create index if not exists duels_opponent on duels(opponent);

alter table duels enable row level security;
alter table follows enable row level security;
alter table players enable row level security;
alter table runs enable row level security;
alter table cash_adjustments enable row level security;
alter table global_events enable row level security;

-- the server uses the service_role key, which needs explicit table privileges on a new Supabase project
grant select, insert, update, delete on public.players, public.runs, public.cash_adjustments, public.global_events, public.follows, public.duels to service_role;
grant usage, select on all sequences in schema public to service_role;
