-- ============================================================================
-- COMPLETE SUPABASE SCHEMA FOR AI RANK TRACKER
-- ============================================================================

-- Drop existing tables (if you want to start fresh)
DROP TABLE IF EXISTS public.citations CASCADE;
DROP TABLE IF EXISTS public.results CASCADE;
DROP TABLE IF EXISTS public.jobs CASCADE;

-- ============================================================================
-- 1. JOBS TABLE
-- ============================================================================
CREATE TABLE public.jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  target_url TEXT NOT NULL,
  location TEXT DEFAULT 'United States',
  device TEXT DEFAULT 'desktop',
  search_mode TEXT DEFAULT 'google',
  status TEXT DEFAULT 'queued', -- 'queued', 'processing', 'completed', 'failed', 'partial'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Index for faster queries
CREATE INDEX idx_jobs_status ON public.jobs(status);
CREATE INDEX idx_jobs_created_at ON public.jobs(created_at DESC);

-- ============================================================================
-- 2. RESULTS TABLE
-- ============================================================================
CREATE TABLE public.results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  rank INTEGER,
  url TEXT,
  search_volume INTEGER DEFAULT 0,
  
  -- Async tracking
  serpapi_id TEXT,
  processing_status TEXT DEFAULT 'pending', -- 'pending', 'complete', 'failed'
  
  -- AI data
  ai_present BOOLEAN DEFAULT false,
  ai_content TEXT,
  ai_sentiment TEXT, -- 'positive', 'neutral', 'negative'
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Indexes
CREATE INDEX idx_results_job_id ON public.results(job_id);
CREATE INDEX idx_results_processing_status ON public.results(processing_status);
CREATE INDEX idx_results_serpapi_id ON public.results(serpapi_id);

-- ============================================================================
-- 3. CITATIONS TABLE (NEW!)
-- ============================================================================
CREATE TABLE public.citations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  result_id UUID REFERENCES public.results(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT,
  snippet TEXT,
  is_user_domain BOOLEAN DEFAULT false,
  is_competitor BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Indexes
CREATE INDEX idx_citations_result_id ON public.citations(result_id);
CREATE INDEX idx_citations_is_user_domain ON public.citations(is_user_domain);

-- ============================================================================
-- 4. ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 5. CREATE POLICIES (Public access for MVP)
-- ============================================================================
CREATE POLICY "Public Access Jobs" ON public.jobs FOR ALL USING (true);
CREATE POLICY "Public Access Results" ON public.results FOR ALL USING (true);
CREATE POLICY "Public Access Citations" ON public.citations FOR ALL USING (true);

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Function to get job progress
CREATE OR REPLACE FUNCTION get_job_progress(job_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  total_count INTEGER;
  completed_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count
  FROM public.results
  WHERE job_id = job_uuid;
  
  SELECT COUNT(*) INTO completed_count
  FROM public.results
  WHERE job_id = job_uuid
  AND processing_status IN ('complete', 'failed');
  
  IF total_count = 0 THEN
    RETURN 0;
  END IF;
  
  RETURN ROUND((completed_count::FLOAT / total_count::FLOAT) * 100);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DONE!
-- ============================================================================
