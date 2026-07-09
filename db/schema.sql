-- Kjøres manuelt mot Neon (Task 9). Idempotent.
create extension if not exists "pgcrypto";

create table if not exists orders (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  site           text not null,
  product        text,
  config         jsonb not null default '{}'::jsonb,
  preferred_date date,
  name           text not null,
  phone          text not null,
  email          text not null,
  address        text,
  price_nok      integer,
  utm            jsonb not null default '{}'::jsonb,
  notify         jsonb not null default '{}'::jsonb,
  status         text not null default 'new'
);

create index if not exists orders_created_at_idx on orders (created_at desc);
create index if not exists orders_site_idx on orders (site);
