-- MATRYX ESPORTS database schema (Supabase SQL Editor)
-- Run this entire file in a NEW Supabase project. Never expose the service_role key.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player',
  ff_uid text,
  role text not null default 'player' check (role in ('player','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mode text not null check (mode in ('Solo','Duo','Squad','Clash Squad')),
  start_at timestamptz not null,
  max_slots integer not null default 48 check (max_slots between 2 and 1000),
  prize_description text,
  status text not null default 'upcoming' check (status in ('upcoming','live','completed','cancelled')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'registered' check (status in ('registered','approved','rejected','cancelled')),
  created_at timestamptz not null default now(),
  unique(tournament_id, player_id)
);
create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  game_id text,
  description text,
  logo_url text,
  leader_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  created_at timestamptz not null default now()
);
create table if not exists public.guild_members (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.guilds(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('leader','member')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  unique(guild_id, player_id)
);
create table if not exists public.guild_matches (
  id uuid primary key default gen_random_uuid(),
  guild_a uuid not null references public.guilds(id),
  guild_b uuid not null references public.guilds(id),
  scheduled_at timestamptz not null,
  mode text not null default 'Squad' check (mode in ('Solo','Duo','Squad','Clash Squad')),
  status text not null default 'scheduled' check (status in ('challenge_pending','scheduled','completed','cancelled','disputed')),
  challenge_by uuid references public.profiles(id),
  winner_guild_id uuid references public.guilds(id),
  points_awarded integer not null default 0 check (points_awarded >= 0),
  verified boolean not null default false,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (guild_a <> guild_b)
);
create table if not exists public.monthly_prizes (
  month text primary key check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  description text not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.monthly_champions (
  id uuid primary key default gen_random_uuid(),
  month text not null unique check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  guild_id uuid not null references public.guilds(id),
  prize_description text,
  declared_by uuid references public.profiles(id),
  declared_at timestamptz not null default now()
);

-- A new auth account gets a profile. User metadata display_name is optional.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), 'Player'));
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- Current month score summary. Only verified, completed matches count.
create or replace view public.guild_monthly_scores as
with guild_months as (
  select g.id as guild_id, to_char(date_trunc('month', m.scheduled_at), 'YYYY-MM') as month,
    count(*)::int as matches_played,
    count(*) filter (where m.winner_guild_id = g.id)::int as wins,
    coalesce(sum(case when m.winner_guild_id = g.id then m.points_awarded
                      when m.winner_guild_id is null then 1 else 0 end),0)::int as points
  from public.guilds g
  join public.guild_matches m on (m.guild_a = g.id or m.guild_b = g.id)
  where m.status = 'completed' and m.verified = true
  group by g.id, date_trunc('month', m.scheduled_at)
)
select gm.guild_id, gm.month, gm.matches_played, gm.wins, gm.points, g.name, g.logo_url
from guild_months gm join public.guilds g on g.id = gm.guild_id;

alter table public.profiles enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_matches enable row level security;
alter table public.monthly_prizes enable row level security;
alter table public.monthly_champions enable row level security;

-- Profiles: public profile display; players can only update their own profile.
drop policy if exists "Profiles are readable" on public.profiles;
create policy "Profiles are readable" on public.profiles for select using (true);
drop policy if exists "Players update own profile" on public.profiles;
create policy "Players update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "Profile insert own" on public.profiles;
create policy "Profile insert own" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "Admins manage profiles" on public.profiles;
create policy "Admins manage profiles" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

-- Tournaments are public to read; only admins can create/update/delete.
drop policy if exists "Tournaments public read" on public.tournaments;
create policy "Tournaments public read" on public.tournaments for select using (true);
drop policy if exists "Admins manage tournaments" on public.tournaments;
create policy "Admins manage tournaments" on public.tournaments for all using (public.is_admin()) with check (public.is_admin());

-- Players manage only their own entries; admins can inspect/manage all.
drop policy if exists "Entries read own or admin" on public.tournament_entries;
create policy "Entries read own or admin" on public.tournament_entries for select using (player_id = auth.uid() or public.is_admin());
drop policy if exists "Players register own entry" on public.tournament_entries;
create policy "Players register own entry" on public.tournament_entries for insert with check (player_id = auth.uid());
drop policy if exists "Players cancel own entry" on public.tournament_entries;
create policy "Players cancel own entry" on public.tournament_entries for delete using (player_id = auth.uid() or public.is_admin());
drop policy if exists "Admins manage entries" on public.tournament_entries;
create policy "Admins manage entries" on public.tournament_entries for update using (public.is_admin()) with check (public.is_admin());

-- Guilds are publicly visible; leaders can submit and edit their own pending guild; admins approve/manage.
drop policy if exists "Guilds public read" on public.guilds;
create policy "Guilds public read" on public.guilds for select using (true);
drop policy if exists "Players submit own guild" on public.guilds;
create policy "Players submit own guild" on public.guilds for insert with check (leader_id = auth.uid() and status = 'pending');
drop policy if exists "Leaders update own guild" on public.guilds;
create policy "Leaders update own guild" on public.guilds for update using (leader_id = auth.uid() and status = 'pending') with check (leader_id = auth.uid() and status = 'pending');
drop policy if exists "Admins manage guilds" on public.guilds;
create policy "Admins manage guilds" on public.guilds for all using (public.is_admin()) with check (public.is_admin());

-- Guild member management: member can see their own memberships; leaders/admin can manage.
drop policy if exists "Members read own or leaders" on public.guild_members;
create policy "Members read own or leaders" on public.guild_members for select using (player_id = auth.uid() or public.is_admin() or exists(select 1 from public.guilds g where g.id = guild_id and g.leader_id = auth.uid()));
drop policy if exists "Players request membership" on public.guild_members;
create policy "Players request membership" on public.guild_members for insert with check (player_id = auth.uid() and status = 'pending');
drop policy if exists "Leaders and admins manage members" on public.guild_members;
create policy "Leaders and admins manage members" on public.guild_members for all using (public.is_admin() or exists(select 1 from public.guilds g where g.id = guild_id and g.leader_id = auth.uid())) with check (public.is_admin() or exists(select 1 from public.guilds g where g.id = guild_id and g.leader_id = auth.uid()));

-- Match records are public; admins manage results. Guild leaders can create pending challenges only.
drop policy if exists "Matches public read" on public.guild_matches;
create policy "Matches public read" on public.guild_matches for select using (true);
drop policy if exists "Guild leaders challenge" on public.guild_matches;
create policy "Guild leaders challenge" on public.guild_matches for insert with check (
  status = 'challenge_pending' and challenge_by = auth.uid() and
  exists(select 1 from public.guilds g where g.id = guild_a and g.leader_id = auth.uid() and g.status = 'approved')
);
drop policy if exists "Admins manage matches" on public.guild_matches;
create policy "Admins manage matches" on public.guild_matches for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Prizes public read" on public.monthly_prizes;
create policy "Prizes public read" on public.monthly_prizes for select using (true);
drop policy if exists "Admins manage prizes" on public.monthly_prizes;
create policy "Admins manage prizes" on public.monthly_prizes for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Champions public read" on public.monthly_champions;
create policy "Champions public read" on public.monthly_champions for select using (true);
drop policy if exists "Admins manage champions" on public.monthly_champions;
create policy "Admins manage champions" on public.monthly_champions for all using (public.is_admin()) with check (public.is_admin());

grant select on public.guild_monthly_scores to anon, authenticated;
-- The initial account is a normal player. After signing up, promote YOUR account manually
-- using the Supabase SQL Editor, replacing YOUR_USER_EMAIL:
-- update public.profiles set role = 'admin' where id = (select id from auth.users where email = 'YOUR_USER_EMAIL');
