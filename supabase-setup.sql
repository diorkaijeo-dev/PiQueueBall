create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Player',
  avatar_data_url text not null default '',
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 40),
  constraint profiles_avatar_size check (octet_length(avatar_data_url) <= 1500000)
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  constraint friendships_not_self check (requester_id <> addressee_id),
  constraint friendships_unique_direction unique (requester_id, addressee_id)
);

create table if not exists public.match_records (
  id uuid primary key default gen_random_uuid(),
  client_match_id uuid not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('singles', 'doubles')),
  score_one integer not null check (score_one >= 0),
  score_two integer not null check (score_two >= 0),
  winner_team smallint generated always as (
    case when score_one > score_two then 0 else 1 end
  ) stored,
  queue_started_at timestamptz not null default now(),
  played_at timestamptz not null default now(),
  constraint match_records_not_tied check (score_one <> score_two),
  constraint match_records_creator_client_id unique (created_by, client_match_id)
);

create table if not exists public.match_players (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.match_records (id) on delete cascade,
  player_id uuid references public.profiles (id) on delete set null,
  player_name text not null check (char_length(player_name) between 1 and 80),
  team_index smallint not null check (team_index in (0, 1))
);

create table if not exists public.match_queue_players (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.match_records (id) on delete cascade,
  player_id uuid references public.profiles (id) on delete set null,
  player_name text not null check (char_length(player_name) between 1 and 80),
  queue_index integer not null check (queue_index >= 0),
  team_index smallint check (team_index in (0, 1))
);

create index if not exists match_players_player_id_idx on public.match_players (player_id);
create index if not exists match_queue_players_match_id_idx on public.match_queue_players (match_id, queue_index);
create index if not exists match_records_played_at_idx on public.match_records (played_at desc);
create index if not exists friendships_addressee_status_idx on public.friendships (addressee_id, status);

grant select, update on public.profiles to authenticated;
grant select on public.friendships to authenticated;
grant select on public.match_records to authenticated;
grant select on public.match_players to authenticated;
grant select on public.match_queue_players to authenticated;

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.match_records enable row level security;
alter table public.match_players enable row level security;
alter table public.match_queue_players enable row level security;

drop policy if exists "Authenticated users can view profiles" on public.profiles;
create policy "Authenticated users can view profiles"
  on public.profiles for select to authenticated using (true);

drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile"
  on public.profiles for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Users can view their friend requests" on public.friendships;
create policy "Users can view their friend requests"
  on public.friendships for select to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

drop policy if exists "Users can view shared match records" on public.match_records;
create policy "Users can view shared match records"
  on public.match_records for select to authenticated using (true);

drop policy if exists "Users can view match players" on public.match_players;
create policy "Users can view match players"
  on public.match_players for select to authenticated using (true);

drop policy if exists "Users can view saved match queues" on public.match_queue_players;
create policy "Users can view saved match queues"
  on public.match_queue_players for select to authenticated using (true);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1), 'Player')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

create or replace function public.request_friend_by_email(friend_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to add a friend.';
  end if;

  select id into target_id
  from auth.users
  where lower(email) = lower(trim(friend_email))
  limit 1;

  if target_id is null then
    raise exception 'No player account was found for that email.';
  end if;
  if target_id = auth.uid() then
    raise exception 'You cannot add yourself as a friend.';
  end if;

  select id into request_id from public.friendships
  where (requester_id = auth.uid() and addressee_id = target_id)
    or (requester_id = target_id and addressee_id = auth.uid())
  limit 1;
  if request_id is not null then
    raise exception 'A friend request or friendship already exists.';
  end if;

  insert into public.friendships (requester_id, addressee_id)
  values (auth.uid(), target_id)
  returning id into request_id;
  return request_id;
end;
$$;

create or replace function public.lookup_profile_by_email(profile_email text)
returns table (id uuid, display_name text, avatar_data_url text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to look up a player profile.';
  end if;

  return query
  select profiles.id, profiles.display_name, profiles.avatar_data_url
  from auth.users as users
  join public.profiles as profiles on profiles.id = users.id
  where lower(users.email) = lower(trim(profile_email))
  limit 1;
end;
$$;

create or replace function public.respond_to_friend_request(request_id uuid, accept_request boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if accept_request then
    update public.friendships
      set status = 'accepted'
      where id = request_id and addressee_id = auth.uid() and status = 'pending';
  else
    delete from public.friendships
      where id = request_id and addressee_id = auth.uid() and status = 'pending';
  end if;
  if not found then
    raise exception 'Friend request not found or no longer available.';
  end if;
end;
$$;

create or replace function public.remove_friend(friend_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.friendships
    where status = 'accepted'
      and ((requester_id = auth.uid() and addressee_id = friend_id)
        or (requester_id = friend_id and addressee_id = auth.uid()));
  if not found then
    raise exception 'Friendship not found.';
  end if;
end;
$$;

drop function if exists public.record_match(uuid, text, integer, integer, jsonb, timestamptz);
drop function if exists public.record_match(uuid, text, integer, integer, jsonb, jsonb, timestamptz);

create or replace function public.record_match(
  p_client_match_id uuid,
  p_mode text,
  p_score_one integer,
  p_score_two integer,
  p_participants jsonb,
  p_queue_players jsonb,
  p_queue_started_at timestamptz,
  p_played_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_match_id uuid;
  participant_count integer;
  team_one_count integer;
  team_two_count integer;
  unique_user_count integer;
  registered_user_count integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to save match results online.';
  end if;
  if p_client_match_id is null or p_mode not in ('singles', 'doubles')
    or p_score_one is null or p_score_two is null
    or p_score_one < 0 or p_score_two < 0 or p_score_one = p_score_two
    or jsonb_typeof(p_participants) <> 'array'
    or jsonb_typeof(p_queue_players) <> 'array' then
    raise exception 'Match details are invalid.';
  end if;

  select count(*), count(*) filter (where (entry ->> 'team_index')::integer = 0),
    count(*) filter (where (entry ->> 'team_index')::integer = 1),
    count(distinct entry ->> 'user_id') filter (where nullif(entry ->> 'user_id', '') is not null),
    count(*) filter (where nullif(entry ->> 'user_id', '') is not null)
  into participant_count, team_one_count, team_two_count, unique_user_count, registered_user_count
  from jsonb_array_elements(p_participants) as entries(entry);
  if participant_count not between 2 and 4 or unique_user_count <> registered_user_count
    or team_one_count = 0 or team_two_count = 0
    or (p_mode = 'singles' and (team_one_count <> 1 or team_two_count <> 1))
    or (p_mode = 'doubles' and (team_one_count <> 2 or team_two_count <> 2)) then
    raise exception 'Match participants do not fit the selected game format.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_participants) as entries(entry)
    where nullif(entry ->> 'user_id', '') is not null
      and nullif(entry ->> 'user_id', '')::uuid <> auth.uid()
      and not exists (
        select 1 from public.friendships friendship
        where friendship.status = 'accepted'
          and ((friendship.requester_id = auth.uid()
              and friendship.addressee_id = nullif(entry ->> 'user_id', '')::uuid)
            or (friendship.addressee_id = auth.uid()
              and friendship.requester_id = nullif(entry ->> 'user_id', '')::uuid))
      )
  ) then
    raise exception 'Only your own profile and accepted friends can be added as online participants.';
  end if;

  insert into public.match_records (client_match_id, created_by, mode, score_one, score_two, queue_started_at, played_at)
  values (p_client_match_id, auth.uid(), p_mode, p_score_one, p_score_two,
    coalesce(p_queue_started_at, now()), coalesce(p_played_at, now()))
  on conflict (created_by, client_match_id) do nothing
  returning id into saved_match_id;

  if saved_match_id is null then
    select id into saved_match_id from public.match_records
      where created_by = auth.uid() and client_match_id = p_client_match_id;
    return saved_match_id;
  end if;

  insert into public.match_players (match_id, player_id, player_name, team_index)
  select saved_match_id,
    nullif(entry ->> 'user_id', '')::uuid,
    left(trim(entry ->> 'player_name'), 80),
    (entry ->> 'team_index')::smallint
  from jsonb_array_elements(p_participants) as entries(entry);

  insert into public.match_queue_players (match_id, player_id, player_name, queue_index, team_index)
  select saved_match_id,
    nullif(entry ->> 'user_id', '')::uuid,
    left(trim(entry ->> 'player_name'), 80),
    (entry ->> 'queue_index')::integer,
    nullif(entry ->> 'team_index', '')::smallint
  from jsonb_array_elements(p_queue_players) as entries(entry);

  return saved_match_id;
end;
$$;

revoke all on function public.request_friend_by_email(text) from public, anon;
revoke all on function public.lookup_profile_by_email(text) from public, anon;
revoke all on function public.respond_to_friend_request(uuid, boolean) from public, anon;
revoke all on function public.remove_friend(uuid) from public, anon;
revoke all on function public.record_match(uuid, text, integer, integer, jsonb, jsonb, timestamptz, timestamptz) from public, anon;
grant execute on function public.request_friend_by_email(text) to authenticated;
grant execute on function public.lookup_profile_by_email(text) to authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid) to authenticated;
grant execute on function public.record_match(uuid, text, integer, integer, jsonb, jsonb, timestamptz, timestamptz) to authenticated;
