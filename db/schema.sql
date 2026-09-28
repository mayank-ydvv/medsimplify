-- MedSimplify schema (PostgreSQL / Supabase)
-- Reference tables are seeded from shared/catalog.json and read-only at runtime.
-- User tables are protected by row-level security and cascade from patients.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- reference

create table tests (
  id            text primary key,              -- e.g. 'HGB', 'ALT'
  code          text not null unique,
  loinc         text not null,
  display_name  text not null,
  panel         text not null,
  unit          text not null default '',
  kind          text not null default 'numeric' check (kind in ('numeric', 'qualitative')),
  expected_text text,                          -- qualitative tests: 'Nil', 'Negative'
  delta_pct     numeric not null default 20,
  what_it_does  text not null default '',
  higher_means  text not null default '',
  lower_means   text not null default ''
);

create table test_aliases (
  alias   text primary key,                    -- normalised key, e.g. 'sgpt', 'sr creatinine'
  test_id text not null references tests(id)
);

create table reference_ranges (
  id      bigint generated always as identity primary key,
  test_id text not null references tests(id),
  sex     text not null check (sex in ('F', 'M', '*')),
  age_min int  not null,
  age_max int  not null,
  low     numeric,
  high    numeric,
  source  text not null default 'catalog'
);
create index reference_ranges_lookup on reference_ranges (test_id, sex, age_min, age_max);

create table critical_values (
  test_id       text primary key references tests(id),
  critical_low  numeric,
  critical_high numeric,
  message       text
);

create table unit_conversions (
  test_id    text not null references tests(id),
  from_unit  text not null,
  to_unit    text not null,
  multiplier numeric not null,
  primary key (test_id, from_unit, to_unit)
);

-- ---------------------------------------------------------------- user data

create table patients (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid(),
  name       text not null,
  sex        text not null check (sex in ('F', 'M')),
  birth_year int  not null check (birth_year between 1900 and 2100),  -- adults-only (18+) enforced in the API for v1
  created_at timestamptz not null default now()
);
create index patients_user on patients (user_id);

create table reports (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references patients(id) on delete cascade,
  report_date date not null,
  lab_name    text,
  source_type text not null check (source_type in ('digital', 'scan', 'manual', 'sample', 'unknown')),
  file_hash   text,                            -- sha256 of the upload; the file itself is never stored
  status      text not null check (status in ('parsed', 'parse_failed', 'confirmed')),
  parse_notes jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index reports_patient_date on reports (patient_id, report_date desc);
create unique index reports_dedupe on reports (patient_id, file_hash) where file_hash is not null;

create table report_values (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references reports(id) on delete cascade,
  patient_id  uuid not null references patients(id) on delete cascade,
  test_id     text references tests(id),       -- null = unrecognised, excluded from analysis
  raw_name    text not null,
  value_num   numeric,
  value_text  text,
  unit        text,
  ref_low     numeric,
  ref_high    numeric,
  ref_source  text not null check (ref_source in ('report', 'catalog', 'none')),
  status      text not null,
  deviation   numeric not null default 0,
  match_conf  numeric not null default 0,
  -- DENORMALISED on purpose: makes the trend query an index-only range scan,
  -- O(log n + k), instead of a nested loop per point.
  report_date date not null,
  check (value_num is not null or value_text is not null)
);
create index report_values_trend  on report_values (patient_id, test_id, report_date);   -- the trend query
create index report_values_report on report_values (report_id);

create table explanation_cache (
  key        text primary key,                 -- sha256(test_id|status|deviation@0.25|lang)
  lang       text not null,
  body       jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- RLS
-- Enforced by the database, not by route handlers.

alter table patients      enable row level security;
alter table reports       enable row level security;
alter table report_values enable row level security;

create policy patients_owner on patients
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy reports_owner on reports
  for all using (exists (select 1 from patients p where p.id = reports.patient_id and p.user_id = auth.uid()))
  with check (exists (select 1 from patients p where p.id = reports.patient_id and p.user_id = auth.uid()));

create policy report_values_owner on report_values
  for all using (exists (select 1 from patients p where p.id = report_values.patient_id and p.user_id = auth.uid()))
  with check (exists (select 1 from patients p where p.id = report_values.patient_id and p.user_id = auth.uid()));

-- Reference tables: readable by any signed-in user, writable only by the service role.
alter table tests            enable row level security;
alter table test_aliases     enable row level security;
alter table reference_ranges enable row level security;
alter table critical_values  enable row level security;
alter table unit_conversions enable row level security;
create policy tests_read            on tests            for select using (auth.role() = 'authenticated');
create policy test_aliases_read     on test_aliases     for select using (auth.role() = 'authenticated');
create policy reference_ranges_read on reference_ranges for select using (auth.role() = 'authenticated');
create policy critical_values_read  on critical_values  for select using (auth.role() = 'authenticated');
create policy unit_conversions_read on unit_conversions for select using (auth.role() = 'authenticated');

-- ---------------------------------------------------------------- trend query
-- select report_date, value_num, status
--   from report_values
--  where patient_id = $1 and test_id = $2
--  order by report_date;          -- served by report_values_trend
