-- 1. Jobs Table (Tracks the high-level project)
create table public.jobs (
  id uuid default gen_random_uuid() primary key,
  target_url text not null,
  location text default 'United States',
  device text default 'desktop',
  search_mode text default 'google',
  status text default 'processing', -- 'processing', 'completed', 'failed'
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Results Table (Stores individual keyword data)
create table public.results (
  id uuid default gen_random_uuid() primary key,
  job_id uuid references public.jobs(id) on delete cascade,
  query text not null,
  rank integer, -- Null means not ranked
  url text, -- The specific URL that ranked
  search_volume integer default 0,

  -- AI Specifics
  ai_present boolean default false,
  ai_content text,
  ai_sentiment text, -- 'positive', 'neutral', 'negative'

  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. Enable Row Level Security (Optional for now, but good practice)
alter table public.jobs enable row level security;
alter table public.results enable row level security;

-- 4. Create a Policy (Allow public read/write for this MVP phase)
create policy "Public Access" on public.jobs for all using (true);
create policy "Public Access" on public.results for all using (true);
