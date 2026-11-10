-- Salaf Fawri CMS/admin upgrade. BACK UP your database before running.
-- Existing loan_inquiries rows and statuses are preserved.
create extension if not exists pgcrypto;
alter table public.loan_inquiries add column if not exists custom_fields jsonb not null default '{}'::jsonb;
alter table public.site_settings add column if not exists settings_json jsonb not null default '{}'::jsonb;
create table if not exists public.admin_audit_log (
 id uuid primary key default gen_random_uuid(),
 actor text not null default 'admin',
 action text not null,
 details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
grant select, insert on public.admin_audit_log to service_role;
-- Keep site settings accessible only to the server service role.
alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
grant select, insert, update on public.site_settings to service_role;
insert into public.site_settings(id,site_title,site_description,settings_json)
values(1,'سلف فورية','منصة مستقلة للاستفسارات الأولية','{"primary_color":"#087b53","accent_color":"#c7a45b","background_color":"#f4f7f5","text_color":"#17221d","language":"ar"}'::jsonb)
on conflict(id) do update set settings_json=case when public.site_settings.settings_json='{}'::jsonb then excluded.settings_json else public.site_settings.settings_json end;
