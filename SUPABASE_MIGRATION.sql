-- Migration for the existing Salaf Fawri Supabase project.
-- Run only after backing up the database.
create extension if not exists pgcrypto;

alter table public.loan_inquiries
  add column if not exists governorate text,
  add column if not exists requested_amount numeric,
  add column if not exists consent_given boolean not null default false,
  add column if not exists status text not null default 'pending',
  add column if not exists telegram_user_id text;

create table if not exists public.site_settings (
  id integer primary key check (id = 1),
  site_title text,
  site_description text,
  updated_at timestamptz not null default now()
);
insert into public.site_settings(id) values (1) on conflict (id) do nothing;

alter table public.loan_inquiries enable row level security;
alter table public.site_settings enable row level security;
revoke all on public.loan_inquiries from anon, authenticated;
revoke all on public.site_settings from anon, authenticated;
grant select, insert, update on public.loan_inquiries to service_role;
grant select, insert, update on public.site_settings to service_role;
