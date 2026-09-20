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

drop policy if exists "Allow everyone to read users" on "UserDetail";
create policy "admins read all users" on "UserDetail"
  for select to authenticated using (public.is_admin());

drop policy if exists "Admins can update users" on "UserDetail";
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


-- ---------------------------------------------------------------------------
-- Promoting the first administrator
--
-- Sign-up always creates role = 'user' (CHECK + trigger). /admin/users is the
-- only promotion UI and is itself admin-only, so the first admin is made here:
--
--   update "UserDetail" set role = 'admin' where email = 'you@example.com';
-- ---------------------------------------------------------------------------
