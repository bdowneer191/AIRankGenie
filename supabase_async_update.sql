-- Add columns to track async requests
alter table public.results
add column serpapi_id text,
add column processing_status text default 'pending'; -- 'pending', 'complete', 'failed'
