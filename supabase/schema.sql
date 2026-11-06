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

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

create policy "authenticated read profiles"
  on public.profiles for select to authenticated using (true);
create policy "users update own last seen"
  on public.profiles for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy "authenticated read members"
  on public.members for select to authenticated using (true);
create policy "admins write members"
  on public.members for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "authenticated read tasks"
  on public.tasks for select to authenticated using (true);
create policy "admins write tasks"
  on public.tasks for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
create policy "members write own tasks"
  on public.tasks for all to authenticated
  using (
    member_id is not null
    and member_id = (select member_id from public.profiles where user_id = auth.uid())
  )
  with check (
    member_id is not null
    and member_id = (select member_id from public.profiles where user_id = auth.uid())
  );