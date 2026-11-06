create table if not exists public.members (
  id bigint primary key,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  name text not null,
  role text not null,
  email text not null unique,
  color text not null default 'bg-indigo-500',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  member_id bigint unique references public.members (id) on delete set null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id bigint primary key,
  title text not null,
  due_date date not null,
  description text not null,
  completed boolean not null default false,
  member_id bigint references public.members (id) on delete set null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_member_due_date_idx
  on public.tasks (member_id, due_date);
create index if not exists tasks_created_by_idx
  on public.tasks (created_by);

alter table public.members enable row level security;
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;

create schema if not exists private;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, role)
  values (
    new.id,
    case
      when lower(coalesce(new.email, '')) = 'admin@gmail.com' then 'admin'
      when not exists (select 1 from public.profiles where role = 'admin') then 'admin'
      else 'member'
    end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure private.handle_new_auth_user();

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
drop function if exists public.handle_new_auth_user();

-- Promote the first administrator after creating their Auth user:
-- update public.profiles
-- set role = 'admin'
-- where user_id = (select id from auth.users where lower(email) = lower('admin@example.com'));