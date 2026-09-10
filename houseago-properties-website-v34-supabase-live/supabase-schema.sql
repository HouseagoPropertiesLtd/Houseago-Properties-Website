-- Run this once in your Supabase project's SQL editor (Database -> SQL Editor -> New query).
-- It sets up the table that holds each tenant's documents, and locks it down so a
-- tenant can only ever see rows that belong to their own account.

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text,
  valid_until date,
  file_path text not null, -- path inside the "tenant-documents" storage bucket
  created_at timestamptz not null default now()
);

alter table public.documents enable row level security;

-- Tenants can only read their own documents. There is deliberately no
-- insert/update/delete policy for ordinary users: only you, working from the
-- Supabase dashboard (or the service role key, which is never used in this
-- site), can add or change documents.
create policy "Tenants read own documents"
  on public.documents
  for select
  using (auth.uid() = user_id);

-- Storage: create a private bucket called "tenant-documents" from the
-- Storage tab in the dashboard (do this by hand, it's a couple of clicks),
-- then run this so a tenant can only download files from their own folder.
insert into storage.buckets (id, name, public)
values ('tenant-documents', 'tenant-documents', false)
on conflict (id) do nothing;

create policy "Tenants read own files"
  on storage.objects
  for select
  using (
    bucket_id = 'tenant-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Holds the "Your details" box on the documents page (property, tenancy
-- period, utility package) so it is real per tenant rather than sample
-- text. One row per tenant, keyed directly on their user ID.
create table if not exists public.tenant_details (
  user_id uuid primary key references auth.users(id) on delete cascade,
  property text,
  tenancy_period text,
  utility_package text,
  updated_at timestamptz not null default now()
);

alter table public.tenant_details enable row level security;

-- Same pattern as documents: a tenant can only read their own row, and
-- there is no insert/update/delete policy for ordinary users, so only you
-- (from the Supabase dashboard) can set or change these details.
create policy "Tenants read own details"
  on public.tenant_details
  for select
  using (auth.uid() = user_id);

-- Maintenance reports submitted from the portal. A tenant can only be
-- offered the report form once they have a property set in tenant_details
-- (enforced in the website itself, not here) — this table is what stores
-- what they submit.
create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  property text not null,
  category text not null,
  description text not null,
  status text not null default 'New', -- New / In progress / Resolved — you change this from the Table Editor as work happens
  created_at timestamptz not null default now()
);

alter table public.maintenance_requests enable row level security;

-- A tenant can read their own past reports (so their "reported issues"
-- list on the dashboard works), and can create new ones, but only ever
-- for their own account — user_id is set from their own session, never
-- supplied by them directly. There is no update/delete policy for
-- ordinary users: only you can change a report's status or remove one.
create policy "Tenants read own maintenance requests"
  on public.maintenance_requests
  for select
  using (auth.uid() = user_id);

create policy "Tenants create own maintenance requests"
  on public.maintenance_requests
  for insert
  with check (auth.uid() = user_id);

-- =========================================================================
-- Admin support
-- =========================================================================
-- Everything below adds a lightweight "admin" role, entirely on top of the
-- tables above. Being listed in the admins table is what makes admin.html
-- work for an account; nothing else about the site changes.

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;

-- An account can only ever check whether *it itself* is an admin. This is
-- what admin.html uses to decide whether to show the admin screen at all.
create policy "Users read own admin row"
  on public.admins
  for select
  using (auth.uid() = user_id);

-- Add yourself as the first admin after running this file once. Run this
-- with your own account's user ID (Authentication -> Users -> your row ->
-- copy the ID), for example:
--   insert into public.admins (user_id) values ('paste-your-user-id-here');
-- See PORTAL-SETUP.md section 8 for the full walkthrough.

-- Small helper so RLS policies below can check admin membership in one
-- place without repeating the subquery everywhere.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Lets admin.html list every tenant (email + their tenant_details row)
-- without being able to query auth.users directly, and without needing
-- the service_role key. It re-checks admin membership itself, so calling
-- it as a non-admin just raises an error rather than leaking anything.
create or replace function public.admin_list_tenants()
returns table (
  user_id uuid,
  email text,
  property text,
  tenancy_period text,
  utility_package text
)
language sql
security definer
set search_path = public
stable
as $$
  select u.id, u.email, td.property, td.tenancy_period, td.utility_package
  from auth.users u
  left join public.tenant_details td on td.user_id = u.id
  where public.is_admin()
  order by u.email;
$$;

-- Admins can create, update and read every tenant_details row (in addition
-- to the tenant-self policy already above), so admin.html can set a
-- tenant's property/tenancy/utility package instead of you doing it by
-- hand in the Table Editor.
create policy "Admins read all tenant details"
  on public.tenant_details
  for select
  using (public.is_admin());

create policy "Admins insert tenant details"
  on public.tenant_details
  for insert
  with check (public.is_admin());

create policy "Admins update tenant details"
  on public.tenant_details
  for update
  using (public.is_admin());

-- Admins can create, read and delete documents for any tenant, so
-- admin.html can upload and remove files without the Table Editor.
create policy "Admins read all documents"
  on public.documents
  for select
  using (public.is_admin());

create policy "Admins insert documents"
  on public.documents
  for insert
  with check (public.is_admin());

create policy "Admins delete documents"
  on public.documents
  for delete
  using (public.is_admin());

-- Admins can read every maintenance request and update its status (e.g.
-- mark "In progress" or "Resolved") from admin.html.
create policy "Admins read all maintenance requests"
  on public.maintenance_requests
  for select
  using (public.is_admin());

create policy "Admins update maintenance requests"
  on public.maintenance_requests
  for update
  using (public.is_admin());

-- Admins can upload and delete files in any tenant's folder in Storage
-- (tenants keep read-only access to just their own folder, unchanged).
create policy "Admins insert files"
  on storage.objects
  for insert
  with check (bucket_id = 'tenant-documents' and public.is_admin());

create policy "Admins read all files"
  on storage.objects
  for select
  using (bucket_id = 'tenant-documents' and public.is_admin());

create policy "Admins delete files"
  on storage.objects
  for delete
  using (bucket_id = 'tenant-documents' and public.is_admin());
