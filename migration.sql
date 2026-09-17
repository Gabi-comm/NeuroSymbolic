-- ============================================================================
-- NeuroSymbolic (OASYS) — Phase 0/1 database migration
--
-- Run this in the Supabase SQL Editor (Dashboard -> SQL Editor -> New query).
-- It is idempotent: running it twice is safe.
--
-- What it does
--   1. Reconciles "FileUpload" with every column the admin screens actually read
--   2. Moves any rows out of damage_reports into "FileUpload"  (decision D4)
--   3. Drops damage_reports once its rows are safe
--   4. Turns on Row Level Security and adds owner/admin policies  (problem P2)
--
-- Why: the submit path wrote to damage_reports while every admin screen read
-- "FileUpload", so a submitted report could never reach an administrator.
-- "FileUpload" is the table named in the paper's ERD, so it wins.
--
-- BACK UP FIRST: Dashboard -> Database -> Backups, or run
--   select * from damage_reports;
-- and save the output before proceeding.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. UserDetail — identity and role, keyed to auth.users
-- ---------------------------------------------------------------------------
create table if not exists "UserDetail" (
  userloginuuid uuid primary key references auth.users(id) on delete cascade,
  username      text,
  email         text,
  role          text not null default 'user'
);

alter table "UserDetail" add column if not exists username text;
alter table "UserDetail" add column if not exists email    text;
alter table "UserDetail" add column if not exists role     text not null default 'user';


-- ---------------------------------------------------------------------------
-- 2. FileUpload — one row per submitted assessment
--    Column names match what app/admin/* already selects.
-- ---------------------------------------------------------------------------
create table if not exists "FileUpload" (
  id bigint generated always as identity primary key
);

alter table "FileUpload" add column if not exists userid              uuid references "UserDetail"(userloginuuid) on delete set null;
alter table "FileUpload" add column if not exists damage_type         text;
alter table "FileUpload" add column if not exists severity            text;
alter table "FileUpload" add column if not exists state               text default 'Needs Action';
alter table "FileUpload" add column if not exists uploadtime          timestamptz default now();
alter table "FileUpload" add column if not exists address             text;
alter table "FileUpload" add column if not exists latitude            double precision;
alter table "FileUpload" add column if not exists longitude           double precision;
alter table "FileUpload" add column if not exists image_url           text;
alter table "FileUpload" add column if not exists file_name           text;
alter table "FileUpload" add column if not exists confidence          text;
alter table "FileUpload" add column if not exists detection_details   text;
alter table "FileUpload" add column if not exists observation_details jsonb;

-- Phase 2 columns (decision D1): the three parallel severity outputs that RQ3
-- compares, plus the explainable membership trace. Added now so the Phase 2
-- backend has somewhere to write without a second migration.
alter table "FileUpload" add column if not exists severity_fuzzy      text;
alter table "FileUpload" add column if not exists severity_crisp      text;
alter table "FileUpload" add column if not exists severity_confidence text;
alter table "FileUpload" add column if not exists membership_trace    jsonb;
alter table "FileUpload" add column if not exists crack_density_pct   double precision;
alter table "FileUpload" add column if not exists gsd_mm_px           double precision;

create index if not exists fileupload_userid_idx     on "FileUpload" (userid);
create index if not exists fileupload_uploadtime_idx on "FileUpload" (uploadtime desc);
create index if not exists fileupload_state_idx      on "FileUpload" (state);


-- ---------------------------------------------------------------------------
-- 3. Migrate damage_reports -> FileUpload, then drop it       (decision D4)
--
--    Column mapping:
--      user_id         -> userid
--      status          -> state
--      gemini_bulletin -> detection_details   (what the admin UI renders)
--      latitude/longitude/severity/image_url  -> same names
--
--    Guarded so it is a no-op if damage_reports was already dropped.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'damage_reports'
  ) then

    insert into "FileUpload" (
      userid, severity, latitude, longitude, image_url, detection_details, state, uploadtime
    )
    select
      dr.user_id,
      dr.severity,
      dr.latitude,
      dr.longitude,
      dr.image_url,
      dr.gemini_bulletin,
      coalesce(dr.status, 'Needs Action'),
      coalesce(dr.created_at, now())
    from damage_reports dr
    -- do not double-insert if this migration is re-run
    where not exists (
      select 1 from "FileUpload" fu
      where fu.userid = dr.user_id
        and fu.detection_details is not distinct from dr.gemini_bulletin
        and fu.image_url is not distinct from dr.image_url
    );

    raise notice 'damage_reports rows migrated into FileUpload';

    drop table damage_reports;
    raise notice 'damage_reports dropped';
  else
    raise notice 'damage_reports does not exist — nothing to migrate';
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- 4. Row Level Security                                        (problem P2)
--
--    The anon key ships to every browser, so RLS is the only real boundary.
--    The admin check lives in a SECURITY DEFINER function: querying UserDetail
--    from inside a UserDetail policy would recurse.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from "UserDetail"
    where userloginuuid = auth.uid()
      and lower(role) = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;


alter table "UserDetail" enable row level security;

drop policy if exists "read own profile"    on "UserDetail";
drop policy if exists "admins read all"     on "UserDetail";
drop policy if exists "insert own profile"  on "UserDetail";
drop policy if exists "update own profile"  on "UserDetail";
drop policy if exists "admins update roles" on "UserDetail";

create policy "read own profile" on "UserDetail"
  for select to authenticated
  using (userloginuuid = auth.uid());

create policy "admins read all" on "UserDetail"
  for select to authenticated
  using (public.is_admin());

-- Sign-up inserts the profile row; it may only ever be the caller's own row,
-- and the role is forced to 'user' so nobody can self-promote at signup.
create policy "insert own profile" on "UserDetail"
  for insert to authenticated
  with check (userloginuuid = auth.uid() and lower(coalesce(role, 'user')) = 'user');

create policy "update own profile" on "UserDetail"
  for update to authenticated
  using (userloginuuid = auth.uid())
  with check (userloginuuid = auth.uid() and lower(role) = 'user');

create policy "admins update roles" on "UserDetail"
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());


alter table "FileUpload" enable row level security;

drop policy if exists "read own reports"     on "FileUpload";
drop policy if exists "admins read reports"  on "FileUpload";
drop policy if exists "insert own report"    on "FileUpload";
drop policy if exists "admins update state"  on "FileUpload";

create policy "read own reports" on "FileUpload"
  for select to authenticated
  using (userid = auth.uid());

create policy "admins read reports" on "FileUpload"
  for select to authenticated
  using (public.is_admin());

create policy "insert own report" on "FileUpload"
  for insert to authenticated
  with check (userid = auth.uid());

-- Only admins may resolve or reopen a report.
create policy "admins update state" on "FileUpload"
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ---------------------------------------------------------------------------
-- 5. Verify
-- ---------------------------------------------------------------------------
-- Expect rowsecurity = true for both tables:
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in ('UserDetail', 'FileUpload');

-- Expect the policies listed above:
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('UserDetail', 'FileUpload')
order by tablename, policyname;

-- Expect your migrated rows:
select id, userid, severity, state, uploadtime from "FileUpload" order by uploadtime desc limit 10;
