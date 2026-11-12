create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text check (full_name is null or char_length(full_name) <= 200),
  avatar_url  text check (avatar_url is null or char_length(avatar_url) <= 2048),
  plan        text not null default 'free' check (plan ~ '^[a-z][a-z0-9_-]{0,31}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'Un perfil por usuario de auth.users; lo crea el trigger on_auth_user_created.';
comment on column public.profiles.plan is 'Plan del usuario (free por defecto). No editable desde el cliente.';

alter table public.profiles enable row level security;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, avatar_url) on table public.profiles to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    left(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')), ''), 200),
    left(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')), ''), 2048)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, full_name, avatar_url)
select
  u.id,
  left(nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')), ''), 200),
  left(nullif(btrim(coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')), ''), 2048)
from auth.users as u
on conflict (id) do nothing;

create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  snapshot     jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 524288),
  page_count   integer not null default 0 check (page_count >= 0),
  sheet_count  integer not null default 0 check (sheet_count >= 0),
  verdict      text not null default 'ok' check (verdict in ('ok', 'warnings', 'errors')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.projects is
  'Revistas guardadas: configuración, orden de páginas, huellas de archivo y resumen. Nunca los archivos.';

create index if not exists projects_user_id_updated_at_idx on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create or replace function public.enforce_projects_quota()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  max_projects constant integer := 200;
  current_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 0));
  select count(*) into current_count from public.projects where user_id = new.user_id;
  if current_count >= max_projects then
    raise exception 'paginator_projects_quota: máximo % revistas por cuenta', max_projects
      using hint = 'Borra alguna revista guardada antes de crear otra.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_projects_quota() from public, anon, authenticated;

drop trigger if exists projects_enforce_quota on public.projects;
create trigger projects_enforce_quota
  before insert on public.projects
  for each row execute function public.enforce_projects_quota();

revoke all on table public.projects from anon, authenticated;
grant select, delete on table public.projects to authenticated;
grant insert (id, title, snapshot, page_count, sheet_count, verdict) on table public.projects to authenticated;
grant update (title, snapshot, page_count, sheet_count, verdict) on table public.projects to authenticated;

drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own" on public.projects
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own" on public.projects
  for delete to authenticated
  using ((select auth.uid()) = user_id);
