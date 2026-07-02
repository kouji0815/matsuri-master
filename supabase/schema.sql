create table if not exists devices (
  id text primary key,
  workspace_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists categories (
  id text not null,
  workspace_id text not null,
  device_id text not null,
  name text not null,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  show_in_high_traffic boolean not null default false,
  sync_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  cloud_synced_at timestamptz
);

create table if not exists cost_categories (
  id text not null,
  workspace_id text not null,
  device_id text not null,
  name text not null,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  sync_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  cloud_synced_at timestamptz
);

create table if not exists products (
  id text not null,
  workspace_id text not null,
  device_id text not null,
  name text not null,
  icon text not null,
  category text not null,
  price numeric not null default 0,
  unit_cost numeric not null default 0,
  initial_stock integer not null default 0,
  current_stock integer not null default 0,
  warning_stock integer not null default 0,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  sync_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  cloud_synced_at timestamptz
);

alter table if exists products
  add column if not exists sort_order integer not null default 0;

create table if not exists set_menus (
  id text not null,
  workspace_id text not null,
  device_id text not null,
  name text not null,
  price numeric not null default 0,
  item_count integer not null default 1,
  allow_choice boolean not null default true,
  includes_drink boolean not null default false,
  allowed_category_ids jsonb not null default '[]'::jsonb,
  discount_amount numeric not null default 0,
  enabled boolean not null default true,
  sync_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  cloud_synced_at timestamptz
);

create table if not exists sessions (
  id text not null,
  workspace_id text not null,
  device_id text not null,
  name text not null,
  date text not null,
  location text not null default '',
  started_at timestamptz,
  ended_at timestamptz,
  target_sales numeric not null default 0,
  status text not null default 'planned',
  sync_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  cloud_synced_at timestamptz
);

create table if not exists sales (
  id text not null,
  workspace_id text not null,
  device_id text not null,
  order_id text not null,
  session_id text not null,
  items jsonb not null default '[]'::jsonb,
  bundle_id text,
  bundle_name text,
  payment_method text not null default 'cash',
  discount_amount numeric not null default 0,
  discount_reason text not null default '',
  received_amount numeric not null default 0,
  change_amount numeric not null default 0,
  final_total numeric not null default 0,
  total_revenue numeric not null default 0,
  total_cost numeric not null default 0,
  gross_profit numeric not null default 0,
  sync_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  cloud_synced_at timestamptz
);

create table if not exists costs (
  id text not null,
  workspace_id text not null,
  device_id text not null,
  session_id text,
  name text not null,
  amount numeric not null default 0,
  type text not null default 'other',
  cost_category_id text not null default 'cost-other',
  note text not null default '',
  date text not null,
  sync_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  cloud_synced_at timestamptz
);

create table if not exists stock_adjustments (
  id text not null,
  workspace_id text not null,
  device_id text not null,
  product_id text not null,
  product_name text not null,
  delta integer not null default 0,
  reason text not null default 'other',
  note text not null default '',
  sync_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  cloud_synced_at timestamptz
);

create table if not exists app_settings (
  id text not null,
  workspace_id text not null,
  device_id text not null,
  high_traffic_mode boolean not null default false,
  sound_enabled boolean not null default true,
  default_target_sales numeric not null default 0,
  latest_backup_at timestamptz,
  cloud_sync_enabled boolean not null default true,
  last_sync_at timestamptz,
  current_checkout_display jsonb,
  sync_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  cloud_synced_at timestamptz
);

create table if not exists current_checkout_display (
  id text primary key,
  workspace_id text not null,
  device_id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Seed data (products, categories, bundles, etc.) uses fixed ids such as "prod-beer" or
-- "cat-skewer" on every device, and app_settings always uses id = "main". A single-column
-- primary key on "id" therefore causes two different workspaces to collide on the same row and
-- silently overwrite each other's data on sync. Re-key each synced table to a composite primary
-- key on (workspace_id, id) so uniqueness is scoped per workspace instead of globally.
-- Safe to run multiple times; does not drop any table or delete any row.
alter table if exists categories drop constraint if exists categories_pkey;
alter table if exists categories add constraint categories_pkey primary key (workspace_id, id);

alter table if exists cost_categories drop constraint if exists cost_categories_pkey;
alter table if exists cost_categories add constraint cost_categories_pkey primary key (workspace_id, id);

alter table if exists products drop constraint if exists products_pkey;
alter table if exists products add constraint products_pkey primary key (workspace_id, id);

alter table if exists set_menus drop constraint if exists set_menus_pkey;
alter table if exists set_menus add constraint set_menus_pkey primary key (workspace_id, id);

alter table if exists sessions drop constraint if exists sessions_pkey;
alter table if exists sessions add constraint sessions_pkey primary key (workspace_id, id);

alter table if exists sales drop constraint if exists sales_pkey;
alter table if exists sales add constraint sales_pkey primary key (workspace_id, id);

alter table if exists costs drop constraint if exists costs_pkey;
alter table if exists costs add constraint costs_pkey primary key (workspace_id, id);

alter table if exists stock_adjustments drop constraint if exists stock_adjustments_pkey;
alter table if exists stock_adjustments add constraint stock_adjustments_pkey primary key (workspace_id, id);

alter table if exists app_settings drop constraint if exists app_settings_pkey;
alter table if exists app_settings add constraint app_settings_pkey primary key (workspace_id, id);

alter table categories enable row level security;
alter table cost_categories enable row level security;
alter table products enable row level security;
alter table set_menus enable row level security;
alter table sessions enable row level security;
alter table sales enable row level security;
alter table costs enable row level security;
alter table stock_adjustments enable row level security;
alter table app_settings enable row level security;
alter table current_checkout_display enable row level security;

create policy "workspace read categories" on categories for select using (true);
create policy "workspace write categories" on categories for all using (true) with check (true);
create policy "workspace read cost_categories" on cost_categories for select using (true);
create policy "workspace write cost_categories" on cost_categories for all using (true) with check (true);
create policy "workspace read products" on products for select using (true);
create policy "workspace write products" on products for all using (true) with check (true);
create policy "workspace read set_menus" on set_menus for select using (true);
create policy "workspace write set_menus" on set_menus for all using (true) with check (true);
create policy "workspace read sessions" on sessions for select using (true);
create policy "workspace write sessions" on sessions for all using (true) with check (true);
create policy "workspace read sales" on sales for select using (true);
create policy "workspace write sales" on sales for all using (true) with check (true);
create policy "workspace read costs" on costs for select using (true);
create policy "workspace write costs" on costs for all using (true) with check (true);
create policy "workspace read stock_adjustments" on stock_adjustments for select using (true);
create policy "workspace write stock_adjustments" on stock_adjustments for all using (true) with check (true);
create policy "workspace read app_settings" on app_settings for select using (true);
create policy "workspace write app_settings" on app_settings for all using (true) with check (true);
create policy "workspace read current_checkout_display" on current_checkout_display for select using (true);
create policy "workspace write current_checkout_display" on current_checkout_display for all using (true) with check (true);
