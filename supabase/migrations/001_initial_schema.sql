create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  address text,
  city text,
  district text,
  latitude double precision,
  longitude double precision,
  phone text,
  website_url text,
  google_maps_url text,
  instagram_url text,
  facebook_url text,
  google_maps_url text,
  status text default 'open' check (status in ('open', 'temporarily_closed', 'permanently_closed', 'unknown')),
  description text,
  source text,
  source_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.ramen_styles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text
);

create table if not exists public.shop_styles (
  shop_id uuid references public.shops(id) on delete cascade,
  style_id uuid references public.ramen_styles(id) on delete cascade,
  confidence numeric default 1,
  primary key (shop_id, style_id)
);

create table if not exists public.candidate_shops (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text,
  name text not null,
  address text,
  city text,
  district text,
  latitude double precision,
  longitude double precision,
  phone text,
  website_url text,
  source_payload jsonb,
  confidence numeric default 0,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected', 'duplicate', 'needs_location')),
  duplicate_of uuid,
  review_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.shop_submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  latitude double precision,
  longitude double precision,
  phone text,
  website_url text,
  instagram_url text,
  facebook_url text,
  suggested_styles text[],
  submitter_note text,
  submitter_email text,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected', 'duplicate', 'needs_more_info')),
  review_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists shops_status_idx on public.shops(status);
create index if not exists shops_city_district_idx on public.shops(city, district);
create index if not exists shops_location_idx on public.shops(latitude, longitude);
create index if not exists shops_source_idx on public.shops(source, source_id);
create index if not exists ramen_styles_slug_idx on public.ramen_styles(slug);
create index if not exists shop_styles_style_id_idx on public.shop_styles(style_id);
create index if not exists candidate_shops_status_idx on public.candidate_shops(status);
create index if not exists candidate_shops_source_idx on public.candidate_shops(source, source_id);
create unique index if not exists candidate_shops_source_unique_idx on public.candidate_shops(source, source_id);
create index if not exists candidate_shops_confidence_idx on public.candidate_shops(confidence desc);
create index if not exists shop_submissions_status_idx on public.shop_submissions(status);

drop trigger if exists set_shops_updated_at on public.shops;
create trigger set_shops_updated_at
before update on public.shops
for each row execute function public.set_updated_at();

drop trigger if exists set_candidate_shops_updated_at on public.candidate_shops;
create trigger set_candidate_shops_updated_at
before update on public.candidate_shops
for each row execute function public.set_updated_at();

drop trigger if exists set_shop_submissions_updated_at on public.shop_submissions;
create trigger set_shop_submissions_updated_at
before update on public.shop_submissions
for each row execute function public.set_updated_at();

alter table public.shops enable row level security;
alter table public.ramen_styles enable row level security;
alter table public.shop_styles enable row level security;
alter table public.candidate_shops enable row level security;
alter table public.shop_submissions enable row level security;

drop policy if exists "Public can read shops" on public.shops;
create policy "Public can read shops"
on public.shops for select
using (true);

drop policy if exists "Public can read ramen styles" on public.ramen_styles;
create policy "Public can read ramen styles"
on public.ramen_styles for select
using (true);

drop policy if exists "Public can read shop styles" on public.shop_styles;
create policy "Public can read shop styles"
on public.shop_styles for select
using (true);

drop policy if exists "Anyone can submit shops" on public.shop_submissions;
create policy "Anyone can submit shops"
on public.shop_submissions for insert
to anon, authenticated
with check (status = 'pending');

insert into public.ramen_styles (name, slug, description)
values
  ('豚骨系', 'tonkotsu', '豚骨、博多、久留米等濃厚系湯頭。'),
  ('醬油系', 'shoyu', '醬油、正油、中華そば等清爽或厚實醬油湯頭。'),
  ('味噌系', 'miso', '以味噌為主體的湯頭。'),
  ('鹽味系', 'shio', '鹽味、塩、shio 等清澈湯頭。'),
  ('雞白湯系', 'chicken-paitan', '雞白湯、鶏白湯、chicken paitan 等濃厚雞湯。'),
  ('魚介系', 'gyokai', '魚介、煮干、niboshi 等海味湯頭。'),
  ('沾麵', 'tsukemen', '沾麵、つけ麺、tsukemen。'),
  ('家系', 'iekei', '橫濱家系、iekei 風格。'),
  ('二郎系', 'jiro', '二郎、jiro、厚切叉燒與大量蔬菜系。'),
  ('其他', 'other', '尚未分類或混合派系。')
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description;
