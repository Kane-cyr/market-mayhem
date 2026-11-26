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
  profile_at timestamptz,
  reset_ver integer not null default 0              -- bumped by the Market God's reset; the game starts over at $10,000
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
  kind text not null check (kind in ('crash','boom','announce','setprice')),  -- setprice: amount holds the exact share price
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

create table if not exists challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  goal text not null check (goal in ('most','least')),
  start_cash bigint not null check (start_cash > 0),
  prize bigint not null default 0 check (prize >= 0),
  days integer not null check (days between 1 and 24),
  status text not null default 'open' check (status in ('open','closed')),
  winner uuid references players(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create table if not exists challenge_players (
  challenge_id uuid not null references challenges(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  primary key (challenge_id, player_id)
);
alter table challenges enable row level security;
alter table challenge_players enable row level security;
alter table duels enable row level security;
alter table follows enable row level security;
alter table players enable row level security;
alter table runs enable row level security;
alter table cash_adjustments enable row level security;
alter table global_events enable row level security;

-- the server uses the service_role key, which needs explicit table privileges on a new Supabase project
grant select, insert, update, delete on public.players, public.runs, public.cash_adjustments, public.global_events, public.follows, public.duels, public.challenges, public.challenge_players to service_role;
grant usage, select on all sequences in schema public to service_role;

-- messages, crowd flows, social feed and gifts (added later)
create table if not exists messages (id bigint generated always as identity primary key, sender uuid not null references players(id) on delete cascade, recipient uuid not null references players(id) on delete cascade, body text not null check (char_length(body) between 1 and 500), created_at timestamptz not null default now(), read_at timestamptz, check (sender <> recipient));
create table if not exists flows (id bigint generated always as identity primary key, player_id uuid not null references players(id) on delete cascade, ticker text not null check (ticker ~ '^[A-Z]{2,5}$'), frac double precision not null check (frac between -1 and 1), created_at timestamptz not null default now());
create table if not exists posts (id bigint generated always as identity primary key, author uuid not null references players(id) on delete cascade, body text not null check (char_length(body) between 1 and 280), ticker text check (ticker ~ '^[A-Z]{2,5}$'), stance smallint not null default 0 check (stance between -1 and 1), repost_of bigint references posts(id) on delete cascade, created_at timestamptz not null default now(), edited_at timestamptz);
create table if not exists post_likes (post_id bigint not null references posts(id) on delete cascade, player_id uuid not null references players(id) on delete cascade, created_at timestamptz not null default now(), primary key (post_id, player_id));
create table if not exists post_comments (id bigint generated always as identity primary key, post_id bigint not null references posts(id) on delete cascade, author uuid references players(id) on delete cascade, npc text, body text not null check (char_length(body) between 1 and 280), created_at timestamptz not null default now());
create table if not exists gifts (id bigint generated always as identity primary key, sender uuid not null references players(id) on delete cascade, recipient uuid not null references players(id) on delete cascade, item_id text not null, paid bigint not null check (paid >= 0), claimed boolean not null default false, created_at timestamptz not null default now());
alter table messages enable row level security; alter table flows enable row level security; alter table posts enable row level security; alter table post_likes enable row level security; alter table post_comments enable row level security; alter table gifts enable row level security;
grant select, insert, update, delete on public.messages, public.flows, public.posts, public.post_likes, public.post_comments, public.gifts to service_role;
grant usage, select on all sequences in schema public to service_role;

-- who sent a player-to-player payment (null for the Market God); used for the daily sending cap
alter table cash_adjustments add column if not exists sender uuid references players(id) on delete set null;
create index if not exists cash_adjustments_sender_idx on cash_adjustments (sender, created_at);
-- set when a career game has been sent the payment; it stays with that game until acknowledged (claimed), so a
-- ranked run cannot be paid the same money too
alter table cash_adjustments add column if not exists offered_at timestamptz;
create index if not exists gifts_sender_idx on gifts (sender, created_at);

-- per-IP rate limiting for sign-ups, wrong PINs and wrong admin passwords (keys hold a hash, never the IP)
create table if not exists rate_hits (id bigint generated always as identity primary key, key text not null, at timestamptz not null default now());
create index if not exists rate_hits_key_at_idx on rate_hits (key, at);

-- Lockdown: only the game server (service_role) touches the database. The public anon/authenticated roles,
-- whose keys Supabase hands out, get no permissions at all, and every table carries an explicit deny policy.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists deny_public on public.%I', t);
    execute format('create policy deny_public on public.%I as restrictive for all to anon, authenticated using (false) with check (false)', t);
  end loop;
end $$;
