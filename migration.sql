-- ============================================================================
-- OASYS — Supabase schema alignment
--
-- Project: OASYS  (ref vybijjvazuopatbewras, ap-northeast-1)
--
-- Already applied to the live project on 2026-09-20 as two migrations:
--   oasys_add_symbolic_columns_and_fix_role_default
--   oasys_allow_null_location_and_confidence
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
-- Row Level Security — ALREADY CONFIGURED, deliberately not touched
--
-- Both tables have RLS enabled with a working policy set:
--
--   FileUpload   INSERT for users            (INSERT, authenticated)
--                edit or delete own upload   (ALL,    authenticated)
--                admin manage all uploads    (ALL,    authenticated)
--
--   UserDetail   INSERT users based on user_id  (INSERT, authenticated)
--                SELECT users based on user_id  (SELECT, authenticated)
--                Allow everyone to read users   (SELECT, authenticated)
--                users update own profile       (UPDATE, authenticated)
--                users delete own profile       (DELETE, authenticated)
--                Admins can update users        (UPDATE, authenticated)
--
-- Do not replace these with the policies from the old version of this file —
-- they were written against a different table structure.
-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- Promoting an administrator
--
-- Sign-up always creates role = 'user'. The only screen that can promote
-- someone is /admin/users, which is itself admin-only, so the first admin must
-- be made here.
--
--   update "UserDetail" set role = 'admin' where email = 'you@example.com';
--
-- As of 2026-09-20 two admins exist: admin1@test.com and admin2@test.com.
--
-- NOTE: ten rows in UserDetail have a NULL userloginuuid, so they are not
-- linked to an auth.users account and cannot sign in. Promoting one of those
-- has no effect — the admin gate looks the profile up by userloginuuid.
-- ---------------------------------------------------------------------------
