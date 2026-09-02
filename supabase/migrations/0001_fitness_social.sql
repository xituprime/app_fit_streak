-- Apply in the Supabase SQL editor or with `supabase db push`.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null default '', avatar_url text,
  xp_total integer not null default 0, level integer not null default 1,
  current_streak integer not null default 0, best_streak integer not null default 0,
  streak_protectors integer not null default 0 check (streak_protectors >= 0),
  last_workout_date date, timezone text not null default 'UTC', created_at timestamptz not null default now()
);
create table if not exists public.workouts (
  id bigint generated always as identity primary key, user_id uuid not null references public.profiles(id) on delete cascade,
  exercise text not null check (exercise in ('pushups','crunches')), reps integer not null check (reps > 0), duration_seconds integer not null default 0,
  xp_earned integer not null check (xp_earned >= 0), workout_day date not null, created_at timestamptz not null default now()
);
create table if not exists public.friendships (
  id bigint generated always as identity primary key, user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'accepted' check (status in ('pending','accepted')), created_at timestamptz not null default now(), unique(user_id, friend_id), check(user_id <> friend_id)
);
alter table public.profiles enable row level security; alter table public.workouts enable row level security; alter table public.friendships enable row level security;
create policy "profiles public read" on public.profiles for select using (true);
create policy "profile own insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profile own editable fields" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "workouts own read" on public.workouts for select using (auth.uid() = user_id);
create policy "friendships participant read" on public.friendships for select using (auth.uid() in (user_id, friend_id));
create policy "friendships own create" on public.friendships for insert with check (auth.uid() = user_id);
create policy "friendships own delete" on public.friendships for delete using (auth.uid() = user_id);
revoke update on public.profiles from authenticated;
grant update (username, display_name, avatar_url, timezone) on public.profiles to authenticated;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles(id, username, display_name) values(new.id, lower(coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text,1,8))), coalesce(new.raw_user_meta_data->>'display_name','')); return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.record_workout(p_exercise text, p_reps integer, p_duration_seconds integer default 0) returns public.workouts language plpgsql security definer set search_path = public as $$
declare p public.profiles; today date; xp integer; row public.workouts;
begin
  select * into p from public.profiles where id = auth.uid() for update; if not found then raise exception 'Profile not found'; end if;
  today := (now() at time zone p.timezone)::date; xp := case when p_reps >= 20 then 50 else greatest(10,p_reps) end;
  if p.last_workout_date is null then p.current_streak := 1;
  elsif p.last_workout_date = today then null;
  elsif p.last_workout_date = today - 1 then p.current_streak := p.current_streak + 1;
  elsif p.last_workout_date = today - 2 and p.streak_protectors > 0 then p.streak_protectors := p.streak_protectors - 1;
  else p.current_streak := 1; end if;
  p.last_workout_date := today; p.xp_total := p.xp_total + xp; p.level := 1 + floor(p.xp_total / 500.0)::integer; p.best_streak := greatest(p.best_streak, p.current_streak);
  update public.profiles set xp_total=p.xp_total,level=p.level,current_streak=p.current_streak,best_streak=p.best_streak,streak_protectors=p.streak_protectors,last_workout_date=p.last_workout_date where id=p.id;
  insert into public.workouts(user_id,exercise,reps,duration_seconds,xp_earned,workout_day) values(auth.uid(),p_exercise,p_reps,p_duration_seconds,xp,today) returning * into row; return row;
end $$;
revoke all on function public.record_workout(text,integer,integer) from public; grant execute on function public.record_workout(text,integer,integer) to authenticated;
create or replace function public.my_friends() returns setof public.profiles language sql security definer set search_path=public as $$ select p.* from public.profiles p join public.friendships f on (f.friend_id=p.id or f.user_id=p.id) where f.status='accepted' and auth.uid() in (f.user_id,f.friend_id) and p.id<>auth.uid() $$;
create or replace function public.friend_rankings(ranking_metric text default 'streak') returns table(id uuid, username text, display_name text, avatar_url text, xp_total integer, current_streak integer, level integer, week_xp integer) language sql security definer set search_path=public as $$
  with people as (select auth.uid() id union select id from public.my_friends()), stats as (select w.user_id, coalesce(sum(w.xp_earned) filter(where w.workout_day >= current_date-6),0)::int week_xp from public.workouts w group by w.user_id) select p.id,p.username,p.display_name,p.avatar_url,p.xp_total,p.current_streak,p.level,coalesce(s.week_xp,0) from public.profiles p join people x on x.id=p.id left join stats s on s.user_id=p.id order by case when ranking_metric='streak' then p.current_streak when ranking_metric='xp' then p.xp_total else coalesce(s.week_xp,0) end desc,p.username $$;
grant execute on function public.my_friends() to authenticated; grant execute on function public.friend_rankings(text) to authenticated;
create or replace function public.friend_exercise_stats(p_profile_id uuid) returns table(exercise text,total_reps bigint,best_reps integer,workouts bigint) language sql security definer set search_path=public as $$ select exercise,sum(reps),max(reps),count(*) from public.workouts where user_id=p_profile_id group by exercise $$;
grant execute on function public.friend_exercise_stats(uuid) to authenticated;
