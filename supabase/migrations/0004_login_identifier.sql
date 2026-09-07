-- ==========================================================
-- Migration 0004: login by roll number (in addition to email)
-- ==========================================================
-- Supabase Auth only authenticates by email natively. The original app let
-- students sign in with either their email or their university roll number.
-- To preserve that without exposing profile data publicly, we keep a
-- denormalized copy of the email on profiles (populated by the signup
-- trigger) and expose a narrow, anonymous-callable RPC that resolves
-- "email or roll number" -> email, and nothing else about the account.

alter table public.profiles add column if not exists email text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role, roll_number, department, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    new.raw_user_meta_data->>'roll_number',
    coalesce(new.raw_user_meta_data->>'department', 'Computer Science and Engineering'),
    new.email
  );
  return new;
end;
$$;

create or replace function public.resolve_login_email(p_identifier text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when p_identifier ilike '%@%' then lower(p_identifier)
    else (select email from public.profiles where lower(roll_number) = lower(p_identifier) limit 1)
  end;
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;
