-- ============================================================================
-- OASYS — Supabase schema alignment
--
-- Project: OASYS  (ref vybijjvazuopatbewras, ap-northeast-1)
--
-- Already applied to the live project on 2026-09-20 as five migrations:
--   oasys_add_symbolic_columns_and_fix_role_default
--   oasys_allow_null_location_and_confidence
--   oasys_fix_rls_and_atomic_signup
--   oasys_clear_legacy_test_data
--   oasys_role_guard_and_audit_log
--
-- Kept here so the repository records what the database looks like and why.
-- Idempotent: safe to re-run.
--
-- ---------------------------------------------------------------------------
-- IMPORTANT: this file replaces an earlier version that was WRONG.
--
-- That version was written before the live project was reachable. It assumed
-- the schema described in the paper's ERD — UserDetail keyed on userloginuuid,
-- columns named latitude/longitude, and a damage_reports table to migrate from.
-- None of that matched reality:
--
--   * UserDetail is keyed on a bigint `id`; userloginuuid is a nullable unique
--     column that links to auth.users.
--   * FileUpload uses `lat` / `lng`, not latitude / longitude.
--   * `confidence` is real (float4), not text.
--   * damage_reports never existed in this project.
--   * RLS was already enabled with a working set of policies.
--
-- Running the old file would have created constraints that fought the real
-- schema. The application code was corrected to match the database, not the
-- other way round.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Columns the analysis pipeline produces
--
-- The result screen and the evaluation harness emit more than the original
-- schema stored. All additive.
-- ---------------------------------------------------------------------------
alter table "FileUpload" add column if not exists image_url           text;
alter table "FileUpload" add column if not exists gsd_mm_px           double precision;
alter table "FileUpload" add column if not exists crack_density_pct   double precision;

-- The parallel severity outputs research question 3 compares.
alter table "FileUpload" add column if not exists severity_fuzzy      text;
alter table "FileUpload" add column if not exists severity_crisp      text;
alter table "FileUpload" add column if not exists severity_confidence text;
-- Literal DPWH two-band verdict (Narrow / Wide), D.O. 120 s.2019.
alter table "FileUpload" add column if not exists severity_dpwh_nw    text;
alter table "FileUpload" add column if not exists membership_trace    jsonb;

-- Admin corrections, stored BESIDE the model's output rather than over it.
--
-- severity and damage_type are what the system decided; overwriting them would
-- destroy the evidence RQ3 and RQ4 rest on. Location is user-supplied, so a
-- wrong pin is corrected in place on the existing address/lat/lng columns and
-- needs nothing here.
--
-- Every populated row is a licensed engineer disagreeing with the model on one
-- specific detection: corrected_severity against severity_fuzzy is the paired
-- comparison Cohen's Kappa needs. backend/eval/compare.py computes it.
alter table "FileUpload" add column if not exists corrected_severity    text;
alter table "FileUpload" add column if not exists corrected_damage_type text;
alter table "FileUpload" add column if not exists correction_note       text;
alter table "FileUpload" add column if not exists corrected_at          timestamptz;
alter table "FileUpload" add column if not exists corrected_by          uuid;


-- ---------------------------------------------------------------------------
-- 2. UserDetail.role default was broken
--
-- It was  '''user'''::text  — the literal string 'user' INCLUDING the quote
-- characters — which violates the table's own CHECK constraint
-- (role = 'user' OR role = 'admin'). Any insert that omitted role failed.
--
-- The sign-up form always sends role explicitly, which is why this went
-- unnoticed; anything else touching the table would have hit it.
-- ---------------------------------------------------------------------------
alter table "UserDetail" alter column role set default 'user';


-- ---------------------------------------------------------------------------
-- 3. FileUpload.userid had a pointless default
--
-- gen_random_uuid() can never satisfy the foreign key to
-- UserDetail.userloginuuid, so it could only ever produce a failed insert that
-- looked like a permissions problem. The application always supplies the real
-- authenticated uuid.
-- ---------------------------------------------------------------------------
alter table "FileUpload" alter column userid drop default;


-- ---------------------------------------------------------------------------
-- 4. Three NOT NULL constraints the application cannot always satisfy
--
-- lat / lng: the Scan flow analyses an image with no map pin at all — the
-- result screen labels it "Location not provided (quick scan)". Requiring
-- coordinates made every quick-scan submission fail with a not-null violation
-- that reached the user as an opaque database error.
--
-- confidence: when nothing is detected there is no primary detection and so no
-- score. Storing 0 would be a lie — it reads as "certain of nothing" rather
-- than "nothing was measured".
-- ---------------------------------------------------------------------------
alter table "FileUpload" alter column lat        drop not null;
alter table "FileUpload" alter column lng        drop not null;
alter table "FileUpload" alter column confidence drop not null;


-- ---------------------------------------------------------------------------
-- 5. Indexes for the admin console's ordering and filtering
-- ---------------------------------------------------------------------------
create index if not exists fileupload_uploadtime_idx on "FileUpload" (uploadtime desc);
create index if not exists fileupload_userid_idx     on "FileUpload" (userid);
create index if not exists fileupload_state_idx      on "FileUpload" (state);


-- ---------------------------------------------------------------------------
-- Row Level Security — as it stood BEFORE Phase 4 (historical record)
--
--   FileUpload   INSERT for users            (INSERT, authenticated)
--                edit or delete own upload   (ALL,    authenticated)
--                admin manage all uploads    (ALL,    authenticated)
--
--   UserDetail   INSERT users based on user_id  (INSERT, authenticated)
--                SELECT users based on user_id  (SELECT, authenticated)
--                Allow everyone to read users   (SELECT, authenticated)  <-- LEAK
--                users update own profile       (UPDATE, authenticated)
--                users delete own profile       (DELETE, authenticated)  <-- removed
--                Admins can update users        (UPDATE, authenticated)
--
-- Section A below replaces the two marked policies. FileUpload's policies were
-- already correct and are unchanged.
--
-- Promoting an administrator: see the note at the end of this file.
-- ---------------------------------------------------------------------------


-- ============================================================================
-- PHASE 4 (2026-09-20) — applied as three further migrations
--   oasys_fix_rls_and_atomic_signup
--   oasys_clear_legacy_test_data
--   oasys_role_guard_and_audit_log
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. Close the user-enumeration hole
--
-- "Allow everyone to read users" was USING (true): every signed-in user could
-- read all 14 emails, usernames and roles. Own-row reads were already covered
-- by "SELECT users based on user_id", so that policy carries the normal case.
--
-- is_admin() is SECURITY DEFINER so the role lookup bypasses RLS and cannot
-- recurse into UserDetail's own policies. Create it BEFORE dropping the
-- permissive policy, or admin updates break mid-migration.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
  language sql security definer stable set search_path = public
as $$ select exists (select 1 from "UserDetail"
                     where userloginuuid = auth.uid() and role = 'admin'); $$;

-- Postgres has no `create policy if not exists`, so each policy drops ITS OWN
-- name as well as the old one it replaces. Without the second drop this file
-- fails on a re-run with 42710 "policy already exists" — harmless to data, but
-- it aborts partway and reads like a broken setup.
drop policy if exists "Allow everyone to read users" on "UserDetail";
drop policy if exists "admins read all users" on "UserDetail";
create policy "admins read all users" on "UserDetail"
  for select to authenticated using (public.is_admin());

drop policy if exists "Admins can update users" on "UserDetail";
drop policy if exists "admins update users" on "UserDetail";
create policy "admins update users" on "UserDetail"
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Self-delete removed: deleting your own UserDetail row leaves a live auth
-- account with no profile, so every gate reads null for your role and you are
-- locked out of the console and your own reports, with no UI path back.
drop policy if exists "users delete own profile" on "UserDetail";


-- ---------------------------------------------------------------------------
-- B. Atomic sign-up
--
-- The app called auth.signUp() then separately inserted into UserDetail. When
-- the second step failed the account was half-created. Nine orphans with a null
-- userloginuuid had accumulated; none of them could ever sign in.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  insert into "UserDetail" (username, email, userloginuuid, role)
  values (coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
                   split_part(new.email, '@', 1)),
          new.email, new.id, 'user');
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- C. Legacy data cleared (decision D7)
--
--   delete from "FileUpload";   -- 2 test rows
--   delete from "UserDetail";   -- 14 rows, 9 of them orphans
--   delete from auth.users;     -- 5 test accounts
--
-- Not repeated here: re-running it would wipe real data.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- D. Role assignment: guard and audit trail
-- ---------------------------------------------------------------------------
create table if not exists public.role_change_log (
  id bigint generated always as identity primary key,
  changed_at timestamptz not null default now(),
  actor_uuid uuid, actor_email text,
  target_uuid uuid, target_email text not null,
  old_role text, new_role text not null
);
alter table public.role_change_log enable row level security;
drop policy if exists "admins read role log" on public.role_change_log;
create policy "admins read role log" on public.role_change_log
  for select to authenticated using (public.is_admin());
-- No write policies: only the SECURITY DEFINER trigger inserts. An audit log a
-- user can rewrite is not an audit log.

-- Refuse to remove the last administrator, in the database rather than the UI,
-- so it holds however the update arrives.
create or replace function public.guard_last_admin() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare admin_count integer;
begin
  if tg_op = 'DELETE' then
    if old.role = 'admin' then
      select count(*) into admin_count from "UserDetail" where role = 'admin';
      if admin_count <= 1 then
        raise exception 'Cannot delete the last administrator. Promote another account first.'
          using errcode = 'check_violation';
      end if;
    end if;
    return old;
  end if;
  if old.role = 'admin' and new.role is distinct from 'admin' then
    select count(*) into admin_count from "UserDetail" where role = 'admin';
    if admin_count <= 1 then
      raise exception 'Cannot remove the last administrator. Promote another account first.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_last_admin_trigger on "UserDetail";
create trigger guard_last_admin_trigger before update or delete on "UserDetail"
  for each row execute function public.guard_last_admin();

create or replace function public.log_role_change() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if old.role is distinct from new.role then
    insert into public.role_change_log
      (actor_uuid, actor_email, target_uuid, target_email, old_role, new_role)
    values (auth.uid(),
            (select email from "UserDetail" where userloginuuid = auth.uid()),
            new.userloginuuid, new.email, old.role, new.role);
  end if;
  return new;
end $$;

drop trigger if exists log_role_change_trigger on "UserDetail";
create trigger log_role_change_trigger after update on "UserDetail"
  for each row execute function public.log_role_change();


-- ============================================================================
-- F. City Engineer revision (2026-10-21) — NOT YET APPLIED, run in Supabase
--
-- Scan is gone, so every report now has a location; reports carry pavement
-- type (it decides the repair), how the location and the scale were obtained,
-- and the symbolic recommendation. Re-runnable, like A-E.
-- ============================================================================

alter table "FileUpload" add column if not exists pavement_type       text;
alter table "FileUpload" add column if not exists road_class          text;
alter table "FileUpload" add column if not exists road_name           text;
alter table "FileUpload" add column if not exists barangay            text;
alter table "FileUpload" add column if not exists location_accuracy_m double precision;
alter table "FileUpload" add column if not exists location_source     text;
alter table "FileUpload" add column if not exists scale_source        text;
alter table "FileUpload" add column if not exists recommendation      jsonb;

alter table "FileUpload" drop constraint if exists fileupload_pavement_type_check;
alter table "FileUpload" add constraint fileupload_pavement_type_check
  check (pavement_type is null or pavement_type in ('concrete', 'asphalt'));
alter table "FileUpload" drop constraint if exists fileupload_location_source_check;
alter table "FileUpload" add constraint fileupload_location_source_check
  check (location_source is null or location_source in ('device_gps', 'photo_exif', 'manual_pin'));
alter table "FileUpload" drop constraint if exists fileupload_scale_source_check;
alter table "FileUpload" add constraint fileupload_scale_source_check
  check (scale_source is null or scale_source in ('assumed_height', 'reference_card'));

create index if not exists fileupload_severity_idx on "FileUpload" (severity);

-- Who filed it. Role stays user/admin (it is the security boundary); user_type
-- is descriptive only and grants nothing.
alter table "UserDetail" add column if not exists user_type text not null default 'Civilian';
alter table "UserDetail" drop constraint if exists userdetail_user_type_check;
alter table "UserDetail" add constraint userdetail_user_type_check
  check (user_type in ('Civilian', 'Reporter', 'Inspector'));

-- Section 4 relaxed lat/lng for Scan. Restore NOT NULL only when no legacy
-- row would violate it; otherwise leave it and say so.
do $$
begin
  if exists (select 1 from "FileUpload" where lat is null or lng is null) then
    raise notice 'FileUpload has rows without lat/lng; NOT NULL not restored.';
  else
    alter table "FileUpload" alter column lat set not null;
    alter table "FileUpload" alter column lng set not null;
  end if;
end $$;

-- Every account starts as a Civilian. The user type is assigned by an admin
-- on /admin/users, never picked at sign-up: raw_user_meta_data is
-- whatever the browser sent, so nothing in it is trusted beyond the username.
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  insert into "UserDetail" (username, email, userloginuuid, role, user_type)
  values (coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
                   split_part(new.email, '@', 1)),
          new.email, new.id, 'user', 'Civilian');
  return new;
end $$;

-- Column guards. The own-row policies ("users update own profile", "edit or
-- delete own upload") are row-level: without these a user could promote
-- themselves to admin, or overwrite the grade on their own report. Only the
-- City Engineer (admin) changes roles, user types, grades and corrections.
create or replace function public.guard_userdetail_columns() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() and auth.uid() is not null and
     (new.role is distinct from old.role or new.user_type is distinct from old.user_type) then
    raise exception 'Only an admin can change roles or user types.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists guard_userdetail_columns_trigger on "UserDetail";
create trigger guard_userdetail_columns_trigger before update on "UserDetail"
  for each row execute function public.guard_userdetail_columns();

create or replace function public.guard_fileupload_grading() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() and auth.uid() is not null and (
       new.severity              is distinct from old.severity
    or new.state                 is distinct from old.state
    or new.corrected_severity    is distinct from old.corrected_severity
    or new.corrected_damage_type is distinct from old.corrected_damage_type
    or new.correction_note       is distinct from old.correction_note
    or new.corrected_at          is distinct from old.corrected_at
    or new.corrected_by          is distinct from old.corrected_by) then
    raise exception 'Only an admin can change a grade or status.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists guard_fileupload_grading_trigger on "FileUpload";
create trigger guard_fileupload_grading_trigger before update on "FileUpload"
  for each row execute function public.guard_fileupload_grading();


-- ============================================================================
-- G. Captured Distress (2026-10-22) — NOT YET APPLIED, run in Supabase
--
-- A reporter on the road photographs the damage now and files the report
-- later. The photo goes to the private "captures" bucket under the reporter's
-- own folder ({auth uid}/{uuid}.jpg); the row keeps where it was taken, read
-- at the moment of capture, so the report filed later still points at the
-- right spot. reported_at is set once it has been filed. Re-runnable.
--
-- New tables are not exposed to the Data API automatically (Supabase change of
-- 2026-04-28), hence the explicit GRANT. RLS limits every row to its owner;
-- the City Engineer can read all of them.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('captures', 'captures', false)
on conflict (id) do nothing;

drop policy if exists "captures: owner reads"   on storage.objects;
drop policy if exists "captures: owner uploads" on storage.objects;
drop policy if exists "captures: owner deletes" on storage.objects;
drop policy if exists "captures: admin reads"   on storage.objects;

create policy "captures: owner reads" on storage.objects
  for select to authenticated
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "captures: owner uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'captures' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "captures: owner deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'captures' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "captures: admin reads" on storage.objects
  for select to authenticated
  using (bucket_id = 'captures' and public.is_admin());

create table if not exists public.captured_distress (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  image_path          text not null,
  file_name           text,
  lat                 double precision not null,
  lng                 double precision not null,
  location_accuracy_m double precision,
  location_source     text not null,
  address             text,
  barangay            text,
  road_name           text,
  road_class          text,
  surface             text,
  captured_at         timestamptz not null default now(),
  reported_at         timestamptz
);

alter table public.captured_distress drop constraint if exists captured_distress_location_source_check;
alter table public.captured_distress add constraint captured_distress_location_source_check
  check (location_source in ('device_gps', 'photo_exif', 'manual_pin'));
alter table public.captured_distress drop constraint if exists captured_distress_road_class_check;
alter table public.captured_distress add constraint captured_distress_road_class_check
  check (road_class is null or road_class in ('national', 'city'));
alter table public.captured_distress drop constraint if exists captured_distress_surface_check;
alter table public.captured_distress add constraint captured_distress_surface_check
  check (surface is null or surface in ('concrete', 'asphalt'));

create index if not exists captured_distress_user_idx
  on public.captured_distress (user_id, captured_at desc);

alter table public.captured_distress enable row level security;

drop policy if exists "captured_distress: owner reads"   on public.captured_distress;
drop policy if exists "captured_distress: owner inserts" on public.captured_distress;
drop policy if exists "captured_distress: owner updates" on public.captured_distress;
drop policy if exists "captured_distress: owner deletes" on public.captured_distress;
drop policy if exists "captured_distress: admin reads"   on public.captured_distress;

create policy "captured_distress: owner reads" on public.captured_distress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "captured_distress: owner inserts" on public.captured_distress
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "captured_distress: owner updates" on public.captured_distress
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "captured_distress: owner deletes" on public.captured_distress
  for delete to authenticated using ((select auth.uid()) = user_id);
create policy "captured_distress: admin reads" on public.captured_distress
  for select to authenticated using (public.is_admin());

grant select, insert, update, delete on public.captured_distress to authenticated;


-- ============================================================================
-- H. Reports and profiles are private to their owner (2026-10-25)
--    NOT YET APPLIED, run in Supabase
--
-- A signed-in, non-admin account could read every FileUpload row (34 of 34)
-- and every UserDetail row (18 of 18) through the Data API. The live database
-- has drifted from this file (section C's cleared legacy rows are still there),
-- so instead of guessing which policy is the permissive one, every policy on
-- the two tables is dropped and the intended set is created from scratch.
--
-- After this:
--   FileUpload  a user reads and files only their own reports;
--               the City Engineer (admin) reads and changes all of them.
--   UserDetail  a user reads only their own profile;
--               the City Engineer reads all and changes roles and types.
--
-- Nothing in the app needs more. A user never updates or deletes a report or
-- their profile (sign-up writes the profile through handle_new_user, which is
-- SECURITY DEFINER), so the old own-row update/delete policies are not
-- recreated. Section F's guard triggers stay as a second line of defence.
-- Re-runnable.
-- ============================================================================

do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('FileUpload', 'UserDetail')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

alter table "FileUpload" enable row level security;
alter table "UserDetail" enable row level security;

create policy "fileupload: owner reads" on "FileUpload"
  for select to authenticated using ((select auth.uid()) = userid);
create policy "fileupload: owner inserts" on "FileUpload"
  for insert to authenticated with check ((select auth.uid()) = userid);
create policy "fileupload: admin manages" on "FileUpload"
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "userdetail: owner reads" on "UserDetail"
  for select to authenticated using ((select auth.uid()) = userloginuuid);
create policy "userdetail: admin reads" on "UserDetail"
  for select to authenticated using (public.is_admin());
create policy "userdetail: admin updates" on "UserDetail"
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Signed-out visitors (anon) get no policy on either table, so they see
-- nothing. Revoking the table grants makes that hold even if a permissive
-- policy is added later by mistake.
revoke all on "FileUpload" from anon;
revoke all on "UserDetail" from anon;


-- ============================================================================
-- I. No profile until the email is verified (2026-11-02)
--    APPLIED 2026-11-02 (the commented one-time cleanup and cron job are not)
--
-- Sign-up now asks for the code emailed to the address (LoginModal). Until
-- this section, handle_new_user wrote the UserDetail row the moment
-- auth.signUp() ran, so every unverified, mistyped or spam address showed up
-- as an account on /admin/users.
--
-- After this, the profile is written when Supabase marks the email confirmed
-- (the correct code was typed, or the link was followed), and never before.
-- Supabase itself still keeps the unverified sign-up in auth.users: that row
-- is what the code is checked against, so it cannot be skipped without
-- replacing Supabase's email sending. It cannot sign in, owns nothing, and
-- the optional job at the end deletes it after a day.
--
-- An account created already confirmed (email confirmation off, or added from
-- the dashboard) still gets its profile straight away. Re-runnable.
-- ============================================================================

create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  -- Runs on insert and on update of email_confirmed_at; acts once, at the
  -- moment the address is confirmed.
  if new.email_confirmed_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.email_confirmed_at is not null then
    return new;
  end if;

  -- Every account starts as a Civilian; see section F.
  insert into "UserDetail" (username, email, userloginuuid, role, user_type)
  select coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
                  split_part(new.email, '@', 1)),
         new.email, new.id, 'user', 'Civilian'
  where not exists (select 1 from "UserDetail" where userloginuuid = new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------------
-- Run once, by hand: profiles that unverified sign-ups already got before this
-- section. Look first, then delete. Unverified accounts cannot sign in, so
-- they have no reports.
--
--   select d.id, d.username, d.email, u.created_at
--   from "UserDetail" d join auth.users u on u.id = d.userloginuuid
--   where u.email_confirmed_at is null;
--
--   delete from "UserDetail" d using auth.users u
--   where u.id = d.userloginuuid and u.email_confirmed_at is null and d.role <> 'admin';
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- Optional: clear sign-ups that never entered their code, daily. Needs the
-- pg_cron extension (Database > Extensions > pg_cron). A cleared address can
-- simply sign up again.
--
--   select cron.schedule(
--     'delete-unverified-signups', '0 3 * * *',
--     $$ delete from auth.users
--        where email_confirmed_at is null and created_at < now() - interval '1 day' $$
--   );
-- ---------------------------------------------------------------------------


-- ============================================================================
-- J. Owner level (2026-11-02)
--    NOT YET APPLIED, run in Supabase
--
-- Until now any admin could remove any other admin; only the last admin was
-- protected. One admin could therefore strip everyone else's access.
--
-- After this there are three roles:
--   user   files reports.
--   admin  reviews, resolves and corrects reports; sets user types.
--   owner  everything an admin does, and is the only one who can grant or
--          remove admin access, and remove accounts.
--
-- The owner role itself is never granted or removed from the app: only here,
-- in the SQL editor (where auth.uid() is null). So even a stolen admin or
-- owner session cannot create a second owner or demote the first.
--
-- Every rule is a trigger or a SECURITY DEFINER function, not a hidden
-- button: the Data API is reachable from any browser with a valid login.
-- Re-runnable.
-- ============================================================================

-- 1. Allow 'owner' as a role. The live table may carry a role CHECK that is
--    not in this file, so every CHECK that mentions role is replaced.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public."UserDetail"'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table "UserDetail" drop constraint %I', c.conname);
  end loop;
end $$;
alter table "UserDetail" add constraint userdetail_role_check
  check (role is null or role in ('user', 'admin', 'owner'));

-- 2. The owner has every admin power. is_admin() backs all the admin RLS
--    policies, so widening it is what lets the owner into the console.
create or replace function public.is_admin() returns boolean
  language sql security definer stable set search_path = public
as $$ select exists (select 1 from "UserDetail"
                     where userloginuuid = auth.uid() and role in ('admin', 'owner')); $$;

create or replace function public.is_owner() returns boolean
  language sql security definer stable set search_path = public
as $$ select exists (select 1 from "UserDetail"
                     where userloginuuid = auth.uid() and role = 'owner'); $$;

-- 3. Who may change what on a profile. Replaces section F's version.
create or replace function public.guard_userdetail_columns() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  -- The SQL editor and the service role act with no auth.uid(): that is how
  -- the owner is set, so they pass.
  if auth.uid() is null then
    return new;
  end if;

  if old.role = 'owner' and not public.is_owner() then
    raise exception 'The owner account can only be changed by the owner.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.role is distinct from old.role then
    if old.role = 'owner' or new.role = 'owner' then
      raise exception 'The owner role can only be changed in the Supabase SQL editor.'
        using errcode = 'insufficient_privilege';
    end if;
    if not public.is_owner() then
      raise exception 'Only the owner can grant or remove admin access.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.user_type is distinct from old.user_type and not public.is_admin() then
    raise exception 'Only an admin can change user types.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists guard_userdetail_columns_trigger on "UserDetail";
create trigger guard_userdetail_columns_trigger before update on "UserDetail"
  for each row execute function public.guard_userdetail_columns();

-- 4. Keep at least one account with admin power, now counting the owner.
create or replace function public.guard_last_admin() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare admin_count integer;
begin
  if tg_op = 'DELETE' then
    if old.role in ('admin', 'owner') then
      select count(*) into admin_count from "UserDetail" where role in ('admin', 'owner');
      if admin_count <= 1 then
        raise exception 'Cannot delete the last administrator. Promote another account first.'
          using errcode = 'check_violation';
      end if;
    end if;
    return old;
  end if;
  if old.role in ('admin', 'owner') and coalesce(new.role, 'user') not in ('admin', 'owner') then
    select count(*) into admin_count from "UserDetail" where role in ('admin', 'owner');
    if admin_count <= 1 then
      raise exception 'Cannot remove the last administrator. Promote another account first.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

-- 5. Removing an account (owner only). Takes the profile id, not the auth
--    uuid, so legacy profiles with no userloginuuid can be removed too.
--    Their reports are kept, detached from the account, and show as
--    "Removed user"; their unreported captures go with the account.
alter table "FileUpload" alter column userid drop not null;

create or replace function public.delete_user(profile_id bigint) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  target "UserDetail";
begin
  if not public.is_owner() then
    raise exception 'Only the owner can remove accounts.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into target from "UserDetail" where id = profile_id;
  if not found then
    raise exception 'That account no longer exists.' using errcode = 'no_data_found';
  end if;
  if target.userloginuuid = auth.uid() then
    raise exception 'You cannot remove your own account.' using errcode = 'check_violation';
  end if;
  if target.role = 'owner' then
    raise exception 'The owner account cannot be removed.' using errcode = 'check_violation';
  end if;

  insert into public.role_change_log
    (actor_uuid, actor_email, target_uuid, target_email, old_role, new_role)
  values (auth.uid(),
          (select email from "UserDetail" where userloginuuid = auth.uid()),
          target.userloginuuid, coalesce(target.email, '(no email)'),
          target.role, 'removed');

  if target.userloginuuid is not null then
    update "FileUpload" set userid = null where userid = target.userloginuuid;
  end if;
  delete from "UserDetail" where id = profile_id;
  if target.userloginuuid is not null then
    delete from auth.users where id = target.userloginuuid;
  end if;
end $$;

revoke all on function public.delete_user(bigint) from public, anon;
grant execute on function public.delete_user(bigint) to authenticated;

-- 6. The owner. Runs here, with no auth.uid(), so the guard above lets it pass.
do $$
declare n integer;
begin
  update "UserDetail" set role = 'owner'
  where lower(email) = 'gabrieljohnsolomon@gmail.com';
  get diagnostics n = row_count;
  if n = 0 then
    raise notice 'No profile with email gabrieljohnsolomon@gmail.com: sign up and verify with it, then run this block again.';
  end if;
end $$;


-- ============================================================================
-- K. Phone alerts for new reports (2026-11-11)
--    NOT YET APPLIED, run in Supabase. Needs section J first (is_admin with owner).
--
-- An admin turns on "New report alerts" on the console; the phone's Web Push
-- subscription is stored here. On every new "FileUpload" row, a trigger posts
-- the report and the admins' subscriptions to the website
-- (/api/push/new-report) through pg_net, with a shared secret. The website
-- signs and sends the push. It never needs a Supabase service key.
--
-- The table has RLS on and no policies: it is reachable only through the two
-- SECURITY DEFINER functions below, so nobody can list the subscriptions.
-- Re-runnable.
-- ============================================================================

create extension if not exists pg_net with schema extensions;

-- 1. Subscriptions, one per phone/browser (the endpoint is unique to it).
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_uuid   uuid not null references auth.users (id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- 2. Save this phone's subscription for the signed-in admin. A phone that
--    changes hands (another account signs in) moves to the new account.
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can turn on report alerts.' using errcode = 'insufficient_privilege';
  end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then
    raise exception 'Not a push endpoint.' using errcode = 'check_violation';
  end if;
  insert into public.push_subscriptions (endpoint, user_uuid, p256dh, auth, user_agent)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_uuid = excluded.user_uuid, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, updated_at = now();
end $$;

-- 3. Remove a phone's subscription (turning alerts off, or signing out).
--    Knowing the endpoint means holding that phone's subscription.
create or replace function public.delete_push_subscription(p_endpoint text) returns void
  language sql security definer set search_path = public
as $$ delete from public.push_subscriptions where endpoint = p_endpoint; $$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- 4. Where to post, and the secret. Kept in a schema the Data API does not
--    expose. Fill it in with step 6.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.push_config (
  id            boolean primary key default true check (id),
  endpoint_url  text not null,  -- https://<your site>/api/push/new-report
  secret        text not null   -- the same value as PUSH_WEBHOOK_SECRET on the server
);

-- 5. The trigger. Only current admins/owners get it, not the admin who filed
--    the report. Any failure is a warning: a report must never fail to save
--    because an alert could not be sent. pg_net sends after the commit.
create or replace function public.notify_new_report() returns trigger
  language plpgsql security definer set search_path = public, extensions
as $$
declare
  cfg  private.push_config;
  subs jsonb;
begin
  select * into cfg from private.push_config where id;
  if not found then return new; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'endpoint', s.endpoint,
           'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth))), '[]'::jsonb)
    into subs
  from public.push_subscriptions s
  join "UserDetail" u on u.userloginuuid = s.user_uuid
  where u.role in ('admin', 'owner')
    and s.user_uuid is distinct from new.userid;

  if jsonb_array_length(subs) = 0 then return new; end if;

  perform net.http_post(
    url     := cfg.endpoint_url,
    body    := jsonb_build_object(
                 'report', jsonb_build_object(
                   'id', new.id, 'damage_type', new.damage_type, 'severity', new.severity,
                   'barangay', new.barangay, 'road_name', new.road_name, 'address', new.address),
                 'subscriptions', subs),
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || cfg.secret),
    timeout_milliseconds := 10000);
  return new;
exception when others then
  raise warning 'notify_new_report: %', sqlerrm;
  return new;
end $$;

revoke all on function public.notify_new_report() from public, anon, authenticated;

drop trigger if exists fileupload_push_notify on "FileUpload";
create trigger fileupload_push_notify after insert on "FileUpload"
  for each row execute function public.notify_new_report();

-- 6. Your site and secret. Replace both values, then run this block.
--    The URL must be the public HTTPS address of the site (not localhost):
--    Supabase calls it from the internet.
--
-- insert into private.push_config (endpoint_url, secret)
-- values ('https://YOUR-DOMAIN/api/push/new-report', 'PASTE_PUSH_WEBHOOK_SECRET')
-- on conflict (id) do update
--   set endpoint_url = excluded.endpoint_url, secret = excluded.secret;
--
-- Check deliveries: select status_code, content, created
--                   from net._http_response order by created desc limit 10;

-- ---------------------------------------------------------------------------
-- Promoting the first administrator
--
-- Sign-up always creates role = 'user' (CHECK + trigger). /admin/users is the
-- only promotion UI and is itself admin-only, so the first admin is made here:
--
--   update "UserDetail" set role = 'admin' where email = 'you@example.com';
-- ---------------------------------------------------------------------------
