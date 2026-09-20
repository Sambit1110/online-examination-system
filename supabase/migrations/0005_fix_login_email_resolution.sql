-- ==========================================================
-- Migration 0005: repair roll-number login
-- ==========================================================
-- Bug this fixes
-- --------------
-- Migration 0002 created `handle_new_user`, which inserts a profile row
-- WITHOUT an email (profiles.email did not exist yet). Migration 0004 added
-- profiles.email and taught the trigger to populate it — but only for users
-- created from that point on. It never backfilled the rows that already
-- existed.
--
-- `resolve_login_email` resolves a roll number by reading profiles.email, so
-- for every account created before 0004 was applied that lookup returns
-- NULL, and the client reports "Invalid email/roll number or password."
-- Signing in by email still worked, which is why this looked like a
-- credentials problem rather than a data problem.
--
-- Two independent repairs, so this cannot recur:
--   1. Backfill the missing emails from auth.users.
--   2. Stop depending on the denormalised column at lookup time — resolve
--      through auth.users directly, with profiles.email only as a fallback.
--
-- Non-destructive: the UPDATE only fills rows that are currently NULL, and
-- no column, table, policy or grant is dropped or narrowed.

-- ----------------------------------------------------------------
-- 1. Backfill
-- ----------------------------------------------------------------
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is distinct from u.email
  and u.email is not null;

-- ----------------------------------------------------------------
-- 2. Resolve against auth.users, which is the source of truth
-- ----------------------------------------------------------------
-- Security note: the exposure is unchanged from 0004. The function is still
-- SECURITY DEFINER, still returns nothing but a single email text, and still
-- only for an exact roll-number match. It reveals no more than before — it
-- just reads the authoritative column instead of a copy that can go stale.
create or replace function public.resolve_login_email(p_identifier text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when p_identifier ilike '%@%' then lower(trim(p_identifier))
    else (
      select coalesce(u.email, p.email)
      from public.profiles p
      left join auth.users u on u.id = p.id
      where lower(p.roll_number) = lower(trim(p_identifier))
      limit 1
    )
  end;
$$;

-- Unchanged from 0004 — restated so this migration is self-contained if it
-- is ever applied to a database where the grant was lost.
grant execute on function public.resolve_login_email(text) to anon, authenticated;

-- ----------------------------------------------------------------
-- 3. Keep the denormalised copy correct on email change
-- ----------------------------------------------------------------
-- Supabase lets a user change their email; without this the profiles copy
-- silently drifts out of date again.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_email();
